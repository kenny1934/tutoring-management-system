import { ChecktableApp } from "@/components/checktable/ChecktableApp";
import { students } from "@/lib/mock-data/students";
import { checktables } from "@/lib/mock-data/checktables";
import { seedAssignments } from "@/lib/mock-data/assignments";

export default function ChecktablesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">Checktables</h1>
        <p className="text-sm text-ink-600 max-w-3xl">
          Digital version of the per-textbook exercise check tables tutors
          currently use on paper. Select a student to load their state, click
          any chip to assign or mark done, build a print batch across cells,
          and trigger bulk print to the network share.
        </p>
      </div>
      <ChecktableApp
        students={students}
        checktables={checktables}
        initialAssignments={seedAssignments}
      />
    </div>
  );
}
