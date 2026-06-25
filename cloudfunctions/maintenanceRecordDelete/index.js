const cloud = require('wx-server-sdk')

cloud.init({ env: 'dyx0214-d4gg0btzz41aeafe8' })

const db = cloud.database()
const USERS = 'users'
const RECORDS = 'maintenance_records'
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

function canEdit(user) {
  return user && user.role === 'admin'
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const user = await getUser(OPENID)
  if (!canEdit(user)) return fail(403, '无删除维修保养记录权限')
  if (!event.id) return fail(400, '缺少记录 ID')

  const oldRecord = await db.collection(RECORDS).doc(event.id).get().catch(() => null)
  await db.collection(RECORDS).doc(event.id).update({
    data: {
      deleted: true,
      deletedAt: db.serverDate(),
      deletedBy: OPENID,
      updatedAt: db.serverDate(),
      updatedBy: OPENID
    }
  })
  const sourceWorkorderId = oldRecord && oldRecord.data && oldRecord.data.sourceWorkorderId
  if (sourceWorkorderId) {
    await db.collection(WORKORDERS).doc(sourceWorkorderId).update({
      data: {
        deleted: true,
        deletedAt: db.serverDate(),
        deletedBy: OPENID,
        updatedAt: db.serverDate(),
        updatedBy: OPENID
      }
    }).catch(() => null)
  }
  return ok({ id: event.id })
}
