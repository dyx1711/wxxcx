const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const USERS = 'users'
const WHITELIST = 'user_whitelist'

function ok(data) {
  return { code: 0, data }
}

function fail(code, message, data) {
  return { code, message, data }
}

function normalizePermissions(role, permissions = {}) {
  const isAdmin = role === 'admin'
  return {
    canView: permissions.canView !== false || isAdmin,
    canEdit: !!permissions.canEdit || isAdmin,
    canManage: !!permissions.canManage || isAdmin
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const unionid = wxContext.UNIONID || ''
  const now = db.serverDate()
  const profile = event.profile || {}

  if (!openid) {
    return fail(401, '无法获取微信用户 OpenID')
  }

  const userCount = await db.collection(USERS).count()
  const isFirstUser = userCount.total === 0
  const whitelistRes = await db.collection(WHITELIST).where({ openid }).limit(1).get()
  const whitelist = whitelistRes.data[0]

  if (!isFirstUser && (!whitelist || whitelist.status === 'disabled')) {
    return fail(403, '当前微信用户未加入白名单，请联系管理员', { openid, unionid })
  }

  const role = isFirstUser ? 'admin' : (whitelist.role || 'viewer')
  const permissions = normalizePermissions(role, whitelist && whitelist.permissions)
  const userInfo = {
    openid,
    unionid,
    nickName: (whitelist && whitelist.name) || profile.nickName || '微信用户',
    avatarUrl: profile.avatarUrl || '',
    company: (whitelist && whitelist.company) || '未设置',
    department: (whitelist && whitelist.department) || '未设置',
    role,
    roleName: role === 'admin' ? '管理员' : (role === 'editor' ? '编辑员' : '查看员'),
    permissions,
    deviceCount: 0,
    pendingOrders: 0,
    completedOrders: 0,
    status: 'active',
    lastLoginAt: now
  }

  const oldUser = await db.collection(USERS).where({ openid }).limit(1).get()
  if (oldUser.data.length) {
    await db.collection(USERS).doc(oldUser.data[0]._id).update({
      data: {
        ...userInfo,
        updatedAt: now
      }
    })
  } else {
    await db.collection(USERS).add({
      data: {
        ...userInfo,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  if (isFirstUser && !whitelist) {
    await db.collection(WHITELIST).add({
      data: {
        openid,
        unionid,
        name: userInfo.nickName,
        company: userInfo.company,
        department: userInfo.department,
        role: 'admin',
        permissions,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        createdBy: openid
      }
    })
  }

  return ok(userInfo)
}
