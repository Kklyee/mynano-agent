/**
 * 日期处理工具函数
 */

/**
 * 格式化日期
 * @param date 日期对象或时间戳
 * @param format 格式化字符串，默认 'YYYY-MM-DD'
 * @returns 格式化后的日期字符串
 */
export function formatDate(date: Date | number | string, format: string = 'YYYY-MM-DD'): string {
  const d = new Date(date);
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 获取今天的开始时间（00:00:00）
 * @param date 日期对象，默认为今天
 * @returns 日期的开始时间
 */
export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 获取今天的结束时间（23:59:59）
 * @param date 日期对象，默认为今天
 * @returns 日期的结束时间
 */
export function endOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * 获取月份的开始时间
 * @param date 日期对象，默认为当前月
 * @returns 月份的开始时间
 */
export function startOfMonth(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 获取月份的结束时间
 * @param date 日期对象，默认为当前月
 * @returns 月份的结束时间
 */
export function endOfMonth(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * 添加天数
 * @param date 日期对象
 * @param days 要添加的天数（可以为负数）
 * @returns 新的日期对象
 */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * 添加月份
 * @param date 日期对象
 * @param months 要添加的月数（可以为负数）
 * @returns 新的日期对象
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * 添加年份
 * @param date 日期对象
 * @param years 要添加的年数（可以为负数）
 * @returns 新的日期对象
 */
export function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/**
 * 计算两个日期之间的天数差
 * @param date1 第一个日期
 * @param date2 第二个日期
 * @returns 天数差
 */
export function diffDays(date1: Date | number | string, date2: Date | number | string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((d2.getTime() - d1.getTime()) / oneDay);
}

/**
 * 计算两个日期之间的天数差（绝对值）
 * @param date1 第一个日期
 * @param date2 第二个日期
 * @returns 天数差的绝对值
 */
export function diffDaysAbs(date1: Date | number | string, date2: Date | number | string): number {
  return Math.abs(diffDays(date1, date2));
}

/**
 * 判断两个日期是否是同一天
 * @param date1 第一个日期
 * @param date2 第二个日期
 * @returns 是否是同一天
 */
export function isSameDay(date1: Date | number | string, date2: Date | number | string): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * 判断某个日期是否是今天
 * @param date 日期对象
 * @returns 是否是今天
 */
export function isToday(date: Date | number | string): boolean {
  return isSameDay(date, new Date());
}

/**
 * 判断某个日期是否是昨天
 * @param date 日期对象
 * @returns 是否是昨天
 */
export function isYesterday(date: Date | number | string): boolean {
  return isSameDay(date, addDays(new Date(), -1));
}

/**
 * 判断某个日期是否是明天
 * @param date 日期对象
 * @returns 是否是明天
 */
export function isTomorrow(date: Date | number | string): boolean {
  return isSameDay(date, addDays(new Date(), 1));
}

/**
 * 判断是否是闰年
 * @param year 年份
 * @returns 是否是闰年
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * 获取某个月的天数
 * @param year 年份
 * @param month 月份（0-11）
 * @returns 该月的天数
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * 获取日期所在周的星期一
 * @param date 日期对象
 * @returns 星期一的日期
 */
export function getMonday(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 获取日期所在周的星期日
 * @param date 日期对象
 * @returns 星期日的日期
 */
export function getSunday(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  d.setDate(diff);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * 比较两个日期
 * @param date1 第一个日期
 * @param date2 第二个日期
 * @returns -1（date1 < date2）、0（相等）、1（date1 > date2）
 */
export function compareDates(date1: Date | number | string, date2: Date | number | string): number {
  const d1 = new Date(date1).getTime();
  const d2 = new Date(date2).getTime();
  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
}

/**
 * 获取年龄
 * @param birthDate 出生日期
 * @returns 年龄
 */
export function getAge(birthDate: Date | number | string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * 获取相对时间描述（如"3天前"、"2小时后"）
 * @param date 日期对象
 * @param baseDate 基准日期，默认为当前时间
 * @returns 相对时间描述
 */
export function getRelativeTime(date: Date | number | string, baseDate: Date = new Date()): string {
  const target = new Date(date);
  const diff = target.getTime() - baseDate.getTime();
  const absDiff = Math.abs(diff);
  const isPast = diff < 0;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (absDiff < minute) {
    return '刚刚';
  } else if (absDiff < hour) {
    const minutes = Math.floor(absDiff / minute);
    return isPast ? `${minutes}分钟前` : `${minutes}分钟后`;
  } else if (absDiff < day) {
    const hours = Math.floor(absDiff / hour);
    return isPast ? `${hours}小时前` : `${hours}小时后`;
  } else if (absDiff < month) {
    const days = Math.floor(absDiff / day);
    return isPast ? `${days}天前` : `${days}天后`;
  } else if (absDiff < year) {
    const months = Math.floor(absDiff / month);
    return isPast ? `${months}个月前` : `${months}个月后`;
  } else {
    const years = Math.floor(absDiff / year);
    return isPast ? `${years}年前` : `${years}年后`;
  }
}

/**
 * 解析日期字符串
 * @param dateStr 日期字符串
 * @returns 日期对象，解析失败返回 null
 */
export function parseDate(dateStr: string): Date | null {
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * 验证日期是否有效
 * @param date 日期对象或日期字符串
 * @returns 是否是有效日期
 */
export function isValidDate(date: Date | string): boolean {
  if (typeof date === 'string') {
    const parsed = parseDate(date);
    return parsed !== null;
  }
  return !isNaN(date.getTime());
}
