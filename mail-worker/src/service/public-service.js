import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n';
import reqUtils from '../utils/req-utils';
import dayjs from 'dayjs';
import { isDel, roleConst } from '../const/entity-const';
import email from '../entity/email';
import userService from './user-service';
import KvConst from '../const/kv-const';
import accountService from './account-service';
import emailService from './email-service';

const publicService = {

	async emailList(c, params) {

		let { timeSort, num, size } = params;

		const query = orm(c).select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				sendName: email.name,
				subject: email.subject,
				toEmail: email.toEmail,
				toName: email.toName,
				type: email.type,
				createTime: email.createTime,
				content: email.content,
				text: email.text,
				isDel: email.isDel,
		}).from(email)

		if (!size) {
			size = 20
		}

		if (!num) {
			num = 1
		}

		size = Number(size);
		num = Number(num);

		num = (num - 1) * size;

		let conditions = this.buildEmailConditions(params);

		if (conditions.length === 1) {
			query.where(conditions[0])
		} else if (conditions.length > 1) {
			query.where(and(...conditions))
		}

		if (timeSort === 'asc') {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		return query.limit(size).offset(num);

	},

	async deleteEmail(c, params) {
		const emailIds = this.normalizeEmailIds(params);

		if (emailIds.length > 0) {
			const deletedIds = await emailService.deleteByIds(c, emailIds);
			return {
				mode: deletedIds.length > 1 ? 'batch' : 'single',
				deletedCount: deletedIds.length,
				emailIds: deletedIds
			};
		}

		const conditions = this.buildEmailConditions(params, true);

		if (conditions.length === 0) {
			throw new BizError(t('emptyDeleteCondition'));
		}

		const deletedIds = await emailService.deleteByConditions(c, conditions);

		return {
			mode: 'condition',
			deletedCount: deletedIds.length,
			emailIds: deletedIds
		};
	},

	async addUser(c, params) {
		const { list } = params;

		if (list.length === 0) return;

		for (const emailRow of list) {
			if (!verifyUtils.isEmail(emailRow.email)) {
				throw new BizError(t('notEmail'));
			}

			if (!c.env.domain.includes(emailUtils.getDomain(emailRow.email))) {
				throw new BizError(t('notEmailDomain'));
			}

			const { salt, hash } = await saltHashUtils.hashPassword(
				emailRow.password || cryptoUtils.genRandomPwd()
			);

			emailRow.salt = salt;
			emailRow.hash = hash;
		}


		const activeIp = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		const activeTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const roleList = await roleService.roleSelectUse(c);
		const defRole = roleList.find(roleRow => roleRow.isDefault === roleConst.isDefault.OPEN);

		const userList = [];

		for (const emailRow of list) {
			let { email, hash, salt, roleName } = emailRow;
			let type = defRole.roleId;

			if (roleName) {
				const roleRow = roleList.find(role => role.name === roleName);
				type = roleRow ? roleRow.roleId : type;
			}

			const userSql = `INSERT INTO user (email, password, salt, type, os, browser, active_ip, create_ip, device, active_time, create_time)
			VALUES ('${email}', '${hash}', '${salt}', '${type}', '${os}', '${browser}', '${activeIp}', '${activeIp}', '${device}', '${activeTime}', '${activeTime}')`

			const accountSql = `INSERT INTO account (email, name, user_id)
			VALUES ('${email}', '${emailUtils.getName(email)}', 0);`;

			userList.push(c.env.db.prepare(userSql));
			userList.push(c.env.db.prepare(accountSql));

		}

		userList.push(c.env.db.prepare(`UPDATE account SET user_id = (SELECT user_id FROM user WHERE user.email = account.email) WHERE user_id = 0;`))

		try {
			await c.env.db.batch(userList);
		} catch (e) {
			if(e.message.includes('SQLITE_CONSTRAINT')) {
				throw new BizError(t('emailExistDatabase'))
			} else {
				throw e
			}
		}

	},

	async sendEmail(c, params) {

		const adminUser = await userService.selectByEmailIncludeDel(c, c.env.admin);

		if (!adminUser || adminUser.isDel === isDel.DELETE) {
			throw new BizError(t('notExistUser'));
		}

		let {
			sendEmail,
			sendName,
			receiveEmail,
			subject,
			content,
			text,
			attachments,
			sendType,
			emailId
		} = params;

		receiveEmail = this.normalizeReceiveEmail(receiveEmail);

		if (receiveEmail.length === 0) {
			throw new BizError(t('emptyRecipient'));
		}

		const invalidEmail = receiveEmail.find(email => !verifyUtils.isEmail(email));

		if (invalidEmail) {
			throw new BizError(t('notEmail'));
		}

		sendEmail = typeof sendEmail === 'string' && sendEmail.trim() ? sendEmail.trim() : adminUser.email;

		if (!verifyUtils.isEmail(sendEmail)) {
			throw new BizError(t('notEmail'));
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, sendEmail);

		if (!accountRow || accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== adminUser.userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		return await emailService.send(c, {
			accountId: accountRow.accountId,
			name: typeof sendName === 'string' ? sendName.trim() : '',
			sendType,
			emailId,
			receiveEmail,
			subject: typeof subject === 'string' ? subject : '',
			content: typeof content === 'string' ? content : '',
			text: typeof text === 'string' ? text : '',
			attachments: this.normalizeAttachments(attachments)
		}, adminUser.userId);
	},

	async genToken(c, params) {

		await this.verifyUser(c, params)

		const uuid = uuidv4();

		await c.env.kv.put(KvConst.PUBLIC_KEY, uuid);

		return {token: uuid}
	},

	async verifyUser(c, params) {

		const { email, password } = params

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (email !== c.env.admin) {
			throw new BizError(t('notAdmin'));
		}

		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('notExistUser'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError(t('IncorrectPwd'));
		}
	},

	normalizeReceiveEmail(receiveEmail) {
		if (Array.isArray(receiveEmail)) {
			return [...new Set(receiveEmail
				.map(item => typeof item === 'string' ? item.trim() : '')
				.filter(Boolean))];
		}

		if (typeof receiveEmail === 'string') {
			return [...new Set(receiveEmail
				.split(/[,，;；\n\r]+/)
				.map(item => item.trim())
				.filter(Boolean))];
		}

		return [];
	},

	normalizeAttachments(attachments) {
		if (!Array.isArray(attachments)) {
			return [];
		}

		return attachments
			.filter(item => item)
			.map(item => {
				const mimeType = item.type || item.contentType || item.mimeType || 'application/octet-stream';
				return {
					...item,
					type: mimeType,
					contentType: item.contentType || mimeType,
					mimeType: item.mimeType || mimeType
				};
			});
	},

	normalizeEmailIds(params = {}) {
		let { emailId, emailIds } = params;

		const rawIds = [];

		if (emailId || emailId === 0) {
			rawIds.push(emailId);
		}

		if (Array.isArray(emailIds)) {
			rawIds.push(...emailIds);
		} else if (typeof emailIds === 'string') {
			rawIds.push(...emailIds.split(/[,，]/));
		} else if (emailIds || emailIds === 0) {
			rawIds.push(emailIds);
		}

		return [...new Set(rawIds
			.map(item => Number(item))
			.filter(item => Number.isInteger(item) && item > 0))];
	},

	buildEmailConditions(params = {}, includeTimeRange = false) {
		let { toEmail, content, subject, sendName, sendEmail, type, isDel, startTime, endTime } = params;

		const conditions = [];

		if (toEmail) {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${toEmail}`);
		}

		if (sendEmail) {
			conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail}`);
		}

		if (sendName) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject}`);
		}

		if (content) {
			conditions.push(sql`${email.content} COLLATE NOCASE LIKE ${content}`);
		}

		if (type || type === 0) {
			conditions.push(eq(email.type, Number(type)));
		}

		if (isDel || isDel === 0) {
			conditions.push(eq(email.isDel, Number(isDel)));
		}

		if (includeTimeRange && startTime) {
			conditions.push(gte(email.createTime, `${startTime}`));
		}

		if (includeTimeRange && endTime) {
			conditions.push(lte(email.createTime, `${endTime}`));
		}

		return conditions;
	}

}

export default publicService
