const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const WHITELIST = 'user_whitelist'
const USERS = 'users'

function ok(data) {
  return { code: 0, data }
}

function fail(code, message) {
  return { code, message }
}

async function getUser(openid) {
  const res = await db.collection(USERS).where({ openid, status: 'active' }).limit(1).get()
  return res.data[0]
}

function canManage(user) {
  return user && user.role === 'admin'
}

function normalizeUser(input = {}) {
  const role = input.role || 'viewer'
  const isAdmin = role === 'admin'
  return {
    openid: String(input.openid || '').trim(),
    unionid: String(input.unionid || '').trim(),
    name: String(input.name || '').trim() || '微信用户',
    company: String(input.company || '').trim(),
    department: String(input.department || '').trim(),
    role,
    permissions: {
      canView: isAdmin || !input.permissions || input.permissions.canView !== false,
      canEdit: !!(input.permissions && input.permissions.canEdit) || isAdmin,
      canManage: !!(input.permissions && input.permissions.canManage) || isAdmin
    },
    status: input.status === 'disabled' ? 'disabled' : 'active'
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const admin = await getUser(OPENID)
  if (!canManage(admin)) return fail(403, '无管理白名单权限')

  const action = event.action || 'list'

  if (action === 'list') {
    const whitelist = await db.collection(WHITELIST).orderBy('updatedAt', 'desc').limit(200).get()
    const users = await db.collection(USERS).orderBy('lastLoginAt', 'desc').limit(200).get()
    return ok({
      whitelist: whitelist.data.map(item => ({ ...item, id: item._id })),
      users: users.data.map(item => ({ ...item, id: item._id }))
    })
  }

  if (action === 'upsert') {
    const item = normalizeUser(event.user)
    if (!item.openid) return fail(400, '请填写用户 OpenID')
    const now = db.serverDate()
    const old = await db.collection(WHITELIST).where({ openid: item.openid }).limit(1).get()
    if (old.data.length) {
      await db.collection(WHITELIST).doc(old.data[0]._id).update({
        data: {
          ...item,
          updatedAt: now,
          updatedBy: OPENID
        }
      })
    } else {
      await db.collection(WHITELIST).add({
        data: {
          ...item,
          createdAt: now,
          updatedAt: now,
          createdBy: OPENID,
          updatedBy: OPENID
        }
      })
    }

    const userRes = await db.collection(USERS).where({ openid: item.openid }).limit(1).get()
    if (userRes.data.length) {
      await db.collection(USERS).doc(userRes.data[0]._id).update({
        data: {
          nickName: item.name,
          company: item.company,
          department: item.department,
          role: item.role,
          roleName: item.role === 'admin' ? '管理员' : (item.role === 'editor' ? '编辑员' : '查看员'),
          permissions: item.permissions,
          status: item.status,
          updatedAt: now
        }
      })
    }

    return ok(item)
  }

  if (action === 'remove') {
    const openid = event.openid
    if (!openid) return fail(400, '缺少 OpenID')
    if (openid === OPENID) return fail(400, '不能移除当前登录管理员')
    const old = await db.collection(WHITELIST).where({ openid }).limit(1).get()
    if (old.data.length) {
      await db.collection(WHITELIST).doc(old.data[0]._id).update({
        data: {
          status: 'disabled',
          updatedAt: db.serverDate(),
          updatedBy: OPENID
        }
      })
    }
    const userRes = await db.collection(USERS).where({ openid }).limit(1).get()
    if (userRes.data.length) {
      await db.collection(USERS).doc(userRes.data[0]._id).update({
        data: {
          status: 'disabled',
          updatedAt: db.serverDate()
        }
      })
    }
    return ok({ openid })
  }

  return fail(400, '不支持的操作')
}
