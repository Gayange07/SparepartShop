const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" });

/** YYYY-MM-DD in Asia/Colombo, `daysAgo` days before today. */
export function colomboDate(daysAgo = 0): string {
  return fmt.format(new Date(Date.now() - daysAgo * 86400000));
}

export function colomboMonthStart(): string {
  return colomboDate().slice(0, 8) + "01";
}
