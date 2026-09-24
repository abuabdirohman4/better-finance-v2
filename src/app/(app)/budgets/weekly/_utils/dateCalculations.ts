export interface WeekInfo {
  week: number;
  startDate: Date;   // untuk filter transaksi
  endDate: Date;     // untuk filter transaksi
  budgetStartDate: Date;  // untuk hitung proporsi hari dalam bulan
  budgetEndDate: Date;
}

/** Hitung jumlah minggu dalam bulan (4–6) */
export function getWeeksInMonth(year: number, month: number): number {
  // month = 1-based
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  let weeks = 0;
  let current = new Date(firstDay);
  while (current <= lastDay) {
    weeks++;
    const dow = current.getDay(); // 0=Sun
    const daysToSun = dow === 0 ? 0 : 7 - dow;
    current.setDate(current.getDate() + daysToSun + 1);
  }
  return Math.max(4, Math.min(6, weeks));
}

/** Get info satu minggu */
export function getWeekInfo(year: number, month: number, weekNumber: number): WeekInfo {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  if (weekNumber === 1) {
    // Week 1: mulai 1 bulan, berakhir Minggu pertama
    const dow = firstDay.getDay();
    const daysToSun = dow === 0 ? 0 : 7 - dow;
    const endDate = new Date(firstDay);
    endDate.setDate(firstDay.getDate() + daysToSun);
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date(firstDay);
    startDate.setHours(0, 0, 0, 0);
    return { week: weekNumber, startDate, endDate, budgetStartDate: startDate, budgetEndDate: new Date(endDate) };
  }

  // Week 2+: cari Senin pertama dalam bulan
  const firstMonday = new Date(firstDay);
  const dow = firstDay.getDay();
  const daysToMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  firstMonday.setDate(firstDay.getDate() + daysToMon);

  const startDate = new Date(firstMonday);
  startDate.setDate(firstMonday.getDate() + (weekNumber - 2) * 7);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  // Clamp ke akhir bulan
  if (endDate > lastDay) {
    endDate.setTime(lastDay.getTime());
    endDate.setHours(23, 59, 59, 999);
  }

  let budgetStartDate = new Date(startDate);
  if (budgetStartDate < firstDay) budgetStartDate = new Date(firstDay);
  budgetStartDate.setHours(0, 0, 0, 0);

  return {
    week: weekNumber,
    startDate,
    endDate,
    budgetStartDate,
    budgetEndDate: new Date(endDate),
  };
}

/** Semua week infos untuk satu bulan */
export function getAllWeekInfos(year: number, month: number): WeekInfo[] {
  const count = getWeeksInMonth(year, month);
  return Array.from({ length: count }, (_, i) => getWeekInfo(year, month, i + 1));
}

/**
 * Week default saat membuka bulan (1-based): bulan berjalan → minggu berjalan,
 * bulan lain (lalu/depan) → Week 1 (disengaja, bukan fallback).
 */
export function getCurrentWeekNumber(year: number, month: number, now: Date = new Date()): number {
  if (now.getFullYear() !== year || now.getMonth() + 1 !== month) return 1;
  const infos = getAllWeekInfos(year, month);
  for (let i = infos.length - 1; i >= 0; i--) {
    if (now >= infos[i].startDate) return i + 1;
  }
  return 1; // tak terjangkau: now selalu ≥ tanggal 1 bulan berjalan
}
