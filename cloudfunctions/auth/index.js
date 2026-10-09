/**
 * 微信用户认证云函数
 * 严格依据微信环境 OPENID 进行注册与登录，禁止伪造或默认值
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');
const commerce = require('./common/commerce');
const content = require('./common/contentSafety');

function success(data = null, message = '操作成功') {
  return {
    success: true,
    code: 'OK',
    message,
    data,
    requestId: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    serverTime: Date.now()
  };
}

function fail(code = 'SYSTEM_ERROR', message = '系统内部错误') {
  return {
    success: false,
    code: code || 'SYSTEM_ERROR',
    message: message || '服务暂时不可用，请稍后重试',
    data: null,
    requestId: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    serverTime: Date.now()
  };
}

const ADJECTIVES = ['潮流', '先锋', '高阶', '狂热', '极速', '机能', '复古', '街头', '无界', '纯粹'];
const NOUNS = ['达人', '玩家', '收藏家', '买手', '潮人', '先遣者', '探索家'];
const DEFAULT_AVATAR = '/assets/images/default-avatar.png';

function generateNickname() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${adj}${noun}_${suffix}`;
}

function generateUserNo() {
  return `SNK-${Math.floor(100000 + Math.random() * 900000)}`;
}

exports.main = async (event, context) => {
  const { action, params = {} } = event || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return fail('AUTH_REQUIRED', '未获取到有效微信身份(OPENID)');
  }

  try {
    switch (action) {
      /**
       * 用户静默登录 / 自动注册 (自动获取/安排头像、昵称并随机分配用户ID)
       */
      case 'login': {
        const userRes = await db.collection('users').where({ _openid: openid }).get();
        let user = null;

        if (params.nickName) await content.checkText(cloud,openid,commerce.text(params.nickName,'昵称',1,40),1);
        if(params.avatarUrl) throw commerce.error('CONTENT_REVIEW_REQUIRED','请通过个人资料接口提交头像审核');
        const targetNickName = params.nickName && params.nickName !== '微信用户' ? params.nickName : generateNickname();
        const targetAvatarUrl = params.avatarUrl || DEFAULT_AVATAR;
        const targetUserNo = generateUserNo();

        if (userRes.data.length === 0) {
          user = await commerce.transaction(db, async tx => {
            const existing = (await tx.collection('users').where({ _openid: openid }).limit(1).get()).data[0];
            if (existing) return existing;
            const id = commerce.key('USER', openid);
            const data = {
              _openid: openid,
              userNo: targetUserNo,
              nickName: targetNickName,
              avatarUrl: targetAvatarUrl,
              phone: '',
              balance: 0,
              status: 'ACTIVE',
              createdAt: db.serverDate(),
              updatedAt: db.serverDate(),
              lastLoginAt: db.serverDate()
            };
            await tx.collection('users').doc(id).set({ data });
            return { ...data, _id: id };
          });
        } else {
          user = userRes.data[0];
          const patch = {
            lastLoginAt: db.serverDate()
          };
          // 若已有用户缺少 userNo，或昵称为初始占位符，则自动安排随机 ID 与潮流昵称
          if (!user.userNo) {
            user.userNo = targetUserNo;
            patch.userNo = targetUserNo;
          }
          if ((!user.nickName || user.nickName === '微信用户') && !params.nickName) {
            user.nickName = targetNickName;
            patch.nickName = targetNickName;
          } else if (params.nickName && params.nickName !== user.nickName) {
            user.nickName = params.nickName;
            patch.nickName = params.nickName;
          }
          if (!user.avatarUrl) {
            user.avatarUrl = targetAvatarUrl;
            patch.avatarUrl = targetAvatarUrl;
          } else if (params.avatarUrl && params.avatarUrl !== user.avatarUrl) {
            user.avatarUrl = params.avatarUrl;
            patch.avatarUrl = params.avatarUrl;
          }
          await db.collection('users').doc(user._id).update({
            data: patch
          });
        }

        return success({
          openid,
          user
        }, '登录成功');
      }

      /**
       * 用户自主修改头像与昵称
       */
      case 'updateProfile': {
        const userRes = await db.collection('users').where({ _openid: openid }).get();
        if (userRes.data.length === 0) return fail('USER_NOT_FOUND', '用户不存在');
        const user = userRes.data[0];
        const updateData = { updatedAt: db.serverDate() };
        if (params.nickName) { updateData.nickName = commerce.text(params.nickName,'昵称',1,40); await content.checkText(cloud,openid,updateData.nickName,1); }
        let avatarVersion;
        if (params.avatarUrl) {
          const url=commerce.text(params.avatarUrl,'头像',1,2000);
          if(!url.startsWith('https://')&&!url.startsWith('cloud://'))throw commerce.error('INVALID_PARAMS','头像地址无效');
          avatarVersion=crypto.randomUUID();updateData.pendingAvatarUrl=url;updateData.contentSafety={version:avatarVersion,status:'PENDING'};
        }
        await commerce.transaction(db,async tx=>{
          const current=await commerce.get(tx,'users',user._id);
          if(!current||(current.contentSafety?.version||null)!==(user.contentSafety?.version||null))throw commerce.error('CONFLICT','资料已变化，请刷新');
          await tx.collection('users').doc(user._id).update({ data: updateData });
          if(avatarVersion)await content.reviewAssets(cloud,db,'PROFILE',user._id,avatarVersion,[updateData.pendingAvatarUrl],openid,tx);
        });
        return success({ user: { ...user, ...updateData } }, '个人资料更新成功');
      }

      default:
        return fail('ACTION_NOT_FOUND', `未知指令: ${action}`);
    }
  } catch (err) {
    console.error(`[auth][${action}] Error:`, err);
    return fail(err.code || 'SYSTEM_ERROR', err.message || '用户认证异常');
  }
};
