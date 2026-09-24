import { SubmitReportButton } from "@/components/submit-report-button";

const ISSUE_TYPES = [
  { id: "box_or_hangtab", label: "กล่อง/หูแขวน" },
  { id: "label_or_barcode", label: "ฉลาก/บาร์โค้ด" },
  { id: "other", label: "อื่นๆ" },
] as const;

type ReportDiscrepancyFormProps = {
  action: (formData: FormData) => void;
  error?: string;
  openByDefault?: boolean;
};

export function ReportDiscrepancyForm({ action, error, openByDefault }: ReportDiscrepancyFormProps) {
  return (
    <details id="report" className="rounded-[10px] border border-ink" open={openByDefault || Boolean(error)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-base text-red-700">
        ของที่รับมาไม่ตรงรูป
      </summary>
      <form action={action} className="flex flex-col gap-3 border-t border-ink p-4">
        {error ? <p className="text-base text-red-600">{error}</p> : null}

        <label className="flex flex-col gap-1">
          <span className="text-base text-muted">ชื่อผู้แจ้ง *</span>
          <input
            name="reporterName"
            required
            className="h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-base text-muted">ล็อต/เลขรับเข้า</span>
          <input
            name="lot"
            className="h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-base text-muted">ประเภทปัญหา</legend>
          <div className="flex flex-wrap gap-2">
            {ISSUE_TYPES.map((issue, i) => (
              <label key={issue.id} className="flex min-h-11 items-center gap-2 rounded-[10px] border border-line px-3">
                <input type="radio" name="issueType" value={issue.id} defaultChecked={i === 0} />
                <span className="text-base">{issue.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-base text-muted">รายละเอียด</span>
          <textarea
            name="detail"
            rows={3}
            className="w-full rounded-[10px] border border-line bg-surface p-3 text-base outline-none focus:border-accent"
          />
        </label>

        <p className="text-sm text-muted">แนบรูปยังไม่รองรับในตอนนี้ — จะเพิ่มพร้อมระบบรูปแพ็กเกจ</p>

        <SubmitReportButton />
      </form>
    </details>
  );
}
