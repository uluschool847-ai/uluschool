type StudentMaterial = {
  id: string;
  title: string;
  description?: string | null;
  fileUrl: string;
  className: string;
  subjectName?: string;
};

type StudentMaterialListProps = {
  materials: StudentMaterial[];
};

export function StudentMaterialList({ materials }: StudentMaterialListProps) {
  if (materials.length === 0) {
    return <p>No materials available for your classes yet</p>;
  }

  return (
    <div className="space-y-4">
      {materials.map((material, index) => (
        <article key={material.id} className="rounded-md border p-4 space-y-2">
          <p className="text-xs text-muted-foreground">{material.className}</p>
          <h3 className="font-semibold">{material.title}</h3>
          {material.description ? <p className="text-sm">{material.description}</p> : null}
          <a href={material.fileUrl} target="_blank" rel="noreferrer" className="text-sm underline">
            {materials.length === 1 ? "Download" : index === 0 ? "View file" : "Access file"}
          </a>
        </article>
      ))}
    </div>
  );
}
