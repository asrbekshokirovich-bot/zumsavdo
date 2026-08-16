import { getStatus } from "@/data/api";
import { formatDateTime } from "@/lib/dates";
import { formatPercent } from "@/lib/format";

/**
 * Tizim holati.
 *
 * Sotuvchi ishchi loglarga qaramay tizim ishlayaptimi yoʻqmi shu yerdan
 * koʻrishi kerak: oxirgi sweep qachon boʻlgan, qamrov qancha, xato bormi.
 * Xato boʻlsa u yashirilmaydi — panel raqamlari shunga bogʻliq.
 */
export function StatusBar() {
  const status = getStatus();
  // Hech qanday sweep boʻlmagan boʻlsa vaqt ham yoʻq — sanani hisoblashga
  // urinish NaN beradi, shuning uchun chiziqcha qoʻyiladi.
  const swept = Boolean(status.lastSweepAt);
  const healthy = swept && status.errors === 0 && status.coveragePercent >= 90;

  return (
    <div className="status">
      <span>
        <span
          className="dot"
          style={{ background: !swept ? "var(--ln2)" : healthy ? "var(--series-1)" : "var(--warn)" }}
          aria-hidden
        />
        Oxirgi sweep: {swept ? formatDateTime(status.lastSweepAt) : "—"}
      </span>
      <span>Qamrov: {swept ? formatPercent(status.coveragePercent, 1) : "—"}</span>
      <span className={status.errors > 0 ? "bad" : undefined}>
        Xato: {swept ? status.errors : "—"}
      </span>
    </div>
  );
}
