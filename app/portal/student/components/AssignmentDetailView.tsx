type AssignmentDetail = {
  id: string;
  title: string;
  description: string;
  dueDate: string;
};

type AssignmentDetailViewProps = {
  assignment: AssignmentDetail;
};

export function AssignmentDetailView({ assignment }: AssignmentDetailViewProps) {
  const dueDate = new Date(assignment.dueDate);
  const formattedDueDate = Number.isNaN(dueDate.getTime())
    ? assignment.dueDate
    : dueDate.toLocaleString("en-GB", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">{assignment.title}</h2>
      <p className="text-sm text-muted-foreground">{assignment.description}</p>
      <p className="text-sm">Due: {formattedDueDate}</p>
    </section>
  );
}
