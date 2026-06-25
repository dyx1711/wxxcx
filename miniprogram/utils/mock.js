const LOCATIONS = ['全部', '车间A', '车间B', '办公楼B']
const TYPES = ['全部', '空压机', 'PLC', '冷却塔']

const DEVICES = [
  {
    id: 'd001',
    name: '空压机 A-001',
    model: 'SA-75A',
    type: '空压机',
    typeLabel: '螺杆式空压机',
    location: '车间A',
    area: '1区',
    position: '3号位',
    status: 'alert',
    code: 'EQ-2024-A001',
    manufacturer: '阿特拉斯·科普柯',
    power: '75 kW',
    displacement: '12.5 m³/min',
    purchaseDate: '2022-06-15',
    warrantyDate: '2025-06-14',
    runtime: '8,520 h',
    pressure: '0.62 MPa',
    temperature: '98 °C',
    todayEnergy: '186 kWh',
    owner: { name: '张明', role: '维护工程师', dept: '设备运维中心' },
    alert: {
      title: '排气温度过高',
      desc: '当前 98°C，超过阈值 95°C',
      time: '2026-05-30 08:32 触发'
    }
  },
  {
    id: 'd002',
    name: 'PLC 控制器 B-003',
    model: 'S7-1200',
    type: 'PLC',
    typeLabel: 'PLC控制器',
    location: '办公楼B',
    area: '2层',
    status: 'normal',
    code: 'EQ-2024-B003',
    manufacturer: '西门子',
    power: '0.5 kW',
    purchaseDate: '2023-01-10',
    warrantyDate: '2026-01-09',
    runtime: '4,200 h',
    owner: { name: '李华', role: '电气工程师', dept: '设备运维中心' }
  },
  {
    id: 'd003',
    name: '冷却塔 C-007',
    model: 'CT-200',
    type: '冷却塔',
    typeLabel: '工业冷却塔',
    location: '车间A',
    area: '3区',
    status: 'offline',
    code: 'EQ-2023-C007',
    manufacturer: '良机实业',
    power: '15 kW',
    purchaseDate: '2023-08-20',
    warrantyDate: '2025-08-19',
    runtime: '2,100 h',
    owner: { name: '张明', role: '维护工程师', dept: '设备运维中心' }
  },
  {
    id: 'd004',
    name: '空压机 A-002',
    model: 'SA-55A',
    type: '空压机',
    typeLabel: '螺杆式空压机',
    location: '车间A',
    area: '2区',
    status: 'normal',
    code: 'EQ-2024-A002',
    manufacturer: '阿特拉斯·科普柯',
    power: '55 kW',
    purchaseDate: '2022-09-01',
    warrantyDate: '2025-08-31',
    runtime: '6,800 h',
    owner: { name: '张明', role: '维护工程师', dept: '设备运维中心' }
  },
  {
    id: 'd005',
    name: 'PLC 控制器 B-005',
    model: 'S7-1500',
    type: 'PLC',
    typeLabel: 'PLC控制器',
    location: '车间B',
    area: '1区',
    status: 'normal',
    code: 'EQ-2024-B005',
    manufacturer: '西门子',
    power: '1 kW',
    purchaseDate: '2024-03-15',
    warrantyDate: '2027-03-14',
    runtime: '1,500 h',
    owner: { name: '王强', role: '电气工程师', dept: '设备运维中心' }
  }
]

const WORKORDERS = [
  {
    id: 'wo001',
    no: 'WO-20260530-0086',
    title: '空压机 A-001 故障维修',
    type: 'repair',
    typeLabel: '维修工单',
    priority: 'urgent',
    priorityLabel: '紧急',
    deviceId: 'd001',
    deviceName: '空压机 A-001',
    location: '车间A',
    status: 'pending',
    deadline: '今天 18:00',
    deadlineClass: 'danger',
    createdAt: '2026-05-30 08:35',
    faultType: '排气温度过高',
    description: '设备运行中排气温度持续升高，当前读数 98°C，已超过安全阈值 95°C。系统自动触发告警并生成维修工单，需尽快检查冷却系统和润滑油状态。',
    assignee: '张明',
    progress: [
      { title: '工单创建', desc: '2026-05-30 08:35 · 系统自动', done: true },
      { title: '已派单', desc: '2026-05-30 08:40 · 指派给张明', done: true },
      { title: '处理中', desc: '待工程师到场处理', done: false }
    ]
  },
  {
    id: 'wo002',
    no: 'WO-20260528-0072',
    title: 'PLC 控制器 B-003 定期保养',
    type: 'maintain',
    typeLabel: '保养',
    deviceId: 'd002',
    deviceName: 'PLC 控制器 B-003',
    location: '办公楼B',
    status: 'pending',
    deadline: '6月2日 12:00',
    deadlineClass: 'warning',
    createdAt: '2026-05-28 09:00',
    assignee: '张明'
  },
  {
    id: 'wo003',
    no: 'WO-20260525-0065',
    title: '冷却塔 C-007 季度保养',
    type: 'maintain',
    typeLabel: '保养',
    deviceId: 'd003',
    deviceName: '冷却塔 C-007',
    location: '车间A',
    status: 'pending',
    deadline: '6月5日 17:00',
    deadlineClass: 'muted',
    createdAt: '2026-05-25 14:20',
    assignee: '张明'
  },
  {
    id: 'wo004',
    no: 'WO-20260520-0058',
    title: '空压机 A-002 滤芯更换',
    type: 'maintain',
    typeLabel: '保养',
    deviceId: 'd004',
    deviceName: '空压机 A-002',
    location: '车间A',
    status: 'processing',
    deadline: '6月10日 17:00',
    deadlineClass: 'muted',
    createdAt: '2026-05-20 10:00',
    assignee: '张明'
  }
]

const MAINTENANCE_RECORDS = [
  { id: 'mr001', deviceName: '空压机 A-001', type: '定期保养', date: '2026-03-15', operator: '张明', result: '正常' },
  { id: 'mr002', deviceName: 'PLC 控制器 B-003', type: '故障维修', date: '2026-02-20', operator: '李华', result: '已修复' },
  { id: 'mr003', deviceName: '冷却塔 C-007', type: '季度保养', date: '2026-01-10', operator: '张明', result: '正常' },
  { id: 'mr004', deviceName: '空压机 A-002', type: '滤芯更换', date: '2025-12-05', operator: '张明', result: '正常' }
]

const HOME_STATS = {
  totalDevices: 128,
  monthAlerts: 5,
  pendingMaintain: 3,
  statusOverview: {
    total: 128,
    online: { count: 100, percent: 78 },
    fault: { count: 15, percent: 12 },
    offline: { count: 13, percent: 10 }
  },
  energyWeek: {
    total: 12580,
    unit: 'kWh',
    data: [
      { label: '周一', value: 45 },
      { label: '周二', value: 62 },
      { label: '周三', value: 55 },
      { label: '周四', value: 78 },
      { label: '周五', value: 70 },
      { label: '周六', value: 85 },
      { label: '周日', value: 58 }
    ]
  },
  energyMonth: {
    total: 52800,
    unit: 'kWh',
    data: [
      { label: '1周', value: 40 },
      { label: '2周', value: 55 },
      { label: '3周', value: 68 },
      { label: '4周', value: 72 }
    ]
  }
}

const MOCK_USER = {
  nickName: '张明',
  avatarUrl: '',
  company: '华能制造',
  department: '设备运维中心',
  role: '维护工程师',
  deviceCount: 24,
  pendingOrders: 3,
  completedOrders: 56
}

function delay(data, ms = 300) {
  return new Promise(resolve => setTimeout(() => resolve(data), ms))
}

const AREA_ORDER = ['二级泵房', '次氯酸钠加药间', '鼓风机房']

function normalizeSortText(value = '') {
  return String(value)
    .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, '')
    .trim()
}

function tokenizeSortText(value = '') {
  const text = normalizeSortText(value)
  return text.match(/\d+(?:\.\d+)?|\D+/g) || ['']
}

function naturalCompare(a = '', b = '') {
  const left = tokenizeSortText(a)
  const right = tokenizeSortText(b)
  const max = Math.max(left.length, right.length)
  for (let i = 0; i < max; i += 1) {
    if (left[i] === undefined) return -1
    if (right[i] === undefined) return 1
    const leftNum = Number(left[i])
    const rightNum = Number(right[i])
    const bothNumbers = !Number.isNaN(leftNum) && !Number.isNaN(rightNum)
    if (bothNumbers && leftNum !== rightNum) return leftNum - rightNum
    if (!bothNumbers) {
      const result = String(left[i]).localeCompare(String(right[i]), 'zh-Hans-CN', {
        numeric: true,
        sensitivity: 'base'
      })
      if (result !== 0) return result
    }
  }
  return 0
}

function orderIndex(value = '', order = []) {
  const text = normalizeSortText(value)
  const index = order.findIndex(item => {
    const key = normalizeSortText(item)
    return text === key || text.includes(key)
  })
  return index === -1 ? order.length : index
}

function areaRank(device = {}) {
  const candidates = [
    device.location || '',
    device.area || '',
    `${device.location || ''}${device.area || ''}`,
    `${device.area || ''}${device.location || ''}`
  ].filter(Boolean)
  return Math.min(...candidates.map(item => orderIndex(item, AREA_ORDER)), AREA_ORDER.length)
}

function compareDevices(a = {}, b = {}) {
  const rankDiff = areaRank(a) - areaRank(b)
  if (rankDiff !== 0) return rankDiff
  const locationDiff = naturalCompare(a.location || '', b.location || '')
  if (locationDiff !== 0) return locationDiff
  const areaDiff = naturalCompare(a.area || '', b.area || '')
  if (areaDiff !== 0) return areaDiff
  const typeDiff = naturalCompare(a.typeLabel || a.type || '', b.typeLabel || b.type || '')
  if (typeDiff !== 0) return typeDiff
  const nameDiff = naturalCompare(a.name || '', b.name || '')
  if (nameDiff !== 0) return nameDiff
  return naturalCompare(a.code || '', b.code || '')
}

function filterDevices({ keyword, location, type, mineOnly, page = 1, pageSize = 10 }) {
  let list = [...DEVICES]
  if (mineOnly) {
    list = list.filter(d => d.owner && d.owner.name === MOCK_USER.nickName)
  }
  if (keyword) {
    const kw = keyword.toLowerCase()
    list = list.filter(d =>
      d.name.toLowerCase().includes(kw) ||
      d.model.toLowerCase().includes(kw) ||
      d.location.toLowerCase().includes(kw)
    )
  }
  if (location && location !== '全部') {
    list = list.filter(d => d.location === location)
  }
  if (type && type !== '全部') {
    list = list.filter(d => d.type === type)
  }
  list.sort(compareDevices)
  const start = (page - 1) * pageSize
  const items = list.slice(start, start + pageSize)
  return {
    list: items,
    total: list.length,
    hasMore: start + pageSize < list.length
  }
}

function handleRequest(url, method, data) {
  if (url === '/api/login') {
    return delay({ code: 0, data: MOCK_USER })
  }
  if (url === '/api/home') {
    const todos = WORKORDERS.filter(w => w.status === 'pending').slice(0, 3)
    return delay({ code: 0, data: { ...HOME_STATS, todos } })
  }
  if (url === '/api/devices') {
    return delay({ code: 0, data: filterDevices(data) })
  }
  if (url.startsWith('/api/devices/')) {
    const id = url.split('/').pop()
    const device = DEVICES.find(d => d.id === id)
    return delay({ code: 0, data: device || null })
  }
  if (url === '/api/workorders') {
    let list = [...WORKORDERS]
    if (data.status && data.status !== 'all') {
      list = list.filter(w => w.status === data.status)
    }
    if (data.mineOnly) {
      list = list.filter(w => w.assignee === MOCK_USER.nickName)
    }
    return delay({ code: 0, data: { list, total: list.length } })
  }
  if (url.startsWith('/api/workorders/')) {
    const id = url.split('/').pop()
    const order = WORKORDERS.find(w => w.id === id)
    return delay({ code: 0, data: order || null })
  }
  if (url === '/api/maintenance-records') {
    return delay({ code: 0, data: { list: MAINTENANCE_RECORDS } })
  }
  if (url === '/api/energy-report') {
    return delay({
      code: 0,
      data: {
        month: '2026年5月',
        total: 52800,
        unit: 'kWh',
        compareLastMonth: -3.2,
        topDevices: [
          { name: '空压机 A-001', value: 8200 },
          { name: '空压机 A-002', value: 6500 },
          { name: '冷却塔 C-007', value: 4200 }
        ]
      }
    })
  }
  return delay({ code: 404, message: '接口不存在' })
}

module.exports = {
  LOCATIONS,
  TYPES,
  DEVICES,
  WORKORDERS,
  MOCK_USER,
  handleRequest
}
