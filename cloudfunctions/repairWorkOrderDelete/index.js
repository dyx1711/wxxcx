const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const USERS = 'users'
const WORKORDERS = 'repair_workorders'

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

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const user = await getUser(OPENID)
  if (!user || user.role !== 'admin') return fail(403, '仅管理员可删除已完成工单')
  if (!event.id) return fail(400, '缺少工单 ID')

  const orderRes = await db.collection(WORKORDERS).doc(event.id).get().catch(() => null)
  if (!orderRes || !orderRes.data || orderRes.data.deleted) return fail(404, '工单不存在')
  if (orderRes.data.status !== 'completed') return fail(400, '只能删除已完成工单')

  await db.collection(WORKORDERS).doc(event.id).update({
    data: {
      deleted: true,
      deletedAt: db.serverDate(),
      deletedBy: OPENID,
      updatedAt: db.serverDate(),
      updatedBy: OPENID
    }
  })
  return ok({ id: event.id })
}
