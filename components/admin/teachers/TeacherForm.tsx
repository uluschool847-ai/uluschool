import Link from "next/link";

import { createTeacherAction, updateTeacherAction } from "@/app/(admin)/admin/teachers/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CmsTeacherRecord } from "@/lib/repositories/cms-repository";

type TeacherSubjectOption = {
  id: string;
  slug: string;
  name: string;
};

type CabinetUserOption = {
  id: string;
  fullName: string;
  email?: string | null;
  isActive?: boolean;
};

type TeacherFormProps = {
  mode: "create" | "edit";
  teacher?: CmsTeacherRecord | null;
  subjects?: TeacherSubjectOption[];
  cabinetUsers?: CabinetUserOption[];
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

function TeacherFlash({ message, error }: { message?: string; error?: string }) {
  if (error) {
    return (
      <div
        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (message) {
    return (
      <output className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {message}
      </output>
    );
  }

  return null;
}

export function TeacherForm({
  mode,
  teacher,
  subjects = [],
  cabinetUsers = [],
  flashMessage,
  flashError,
  successRedirect,
  errorRedirect,
}: TeacherFormProps) {
  const isNew = mode === "create";
  const formAction = isNew ? createTeacherAction : updateTeacherAction;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNew ? "Create Teacher Profile" : "Edit Teacher Profile"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <TeacherFlash message={flashMessage} error={flashError} />

        <form
          action={formAction as unknown as (formData: FormData) => void}
          className="space-y-6"
          noValidate
        >
          <input type="hidden" name="flash" value="true" />
          <input type="hidden" name="successRedirect" value={successRedirect} />
          <input type="hidden" name="errorRedirect" value={errorRedirect} />
          {!isNew && teacher ? <input type="hidden" name="id" value={teacher.id} /> : null}
          <input type="hidden" name="photoUrl" value={teacher?.photoUrl ?? ""} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">
                Full name <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="fullName"
                name="fullName"
                required
                aria-required="true"
                defaultValue={teacher?.fullName ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="title"
                name="title"
                required
                aria-required="true"
                defaultValue={teacher?.title ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">
              Bio <span aria-hidden="true">*</span>
            </Label>
            <Textarea
              id="bio"
              name="bio"
              required
              aria-required="true"
              defaultValue={teacher?.bio ?? ""}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayOrder">Display order</Label>
              <Input
                id="displayOrder"
                name="displayOrder"
                type="number"
                defaultValue={teacher?.displayOrder ?? 0}
                min={0}
              />
            </div>

            <div className="flex items-end gap-2">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                value="true"
                defaultChecked={teacher?.isActive ?? true}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="isActive">Active profile</Label>
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-slate-700">Subjects</legend>
            {subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subject options available.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {subjects.map((subject) => {
                  const isChecked =
                    teacher?.subjects?.some((item) => item.id === subject.id) ?? false;

                  return (
                    <label
                      key={subject.id}
                      className="flex items-center gap-3 rounded-md border border-secondary bg-white px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="subjects"
                        value={subject.id}
                        defaultChecked={isChecked}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span>{subject.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="cabinetUserId">Cabinet access</Label>
            <select
              id="cabinetUserId"
              name="cabinetUserId"
              defaultValue={teacher?.cabinetUserId ?? ""}
              className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">No linked account</option>
              {cabinetUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                  {user.email ? ` — ${user.email}` : ""}
                  {user.isActive === false ? " (inactive)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Link a teacher AppUser account to allow cabinet access.
            </p>
          </div>

          <div className="space-y-3">
            <Label htmlFor="photo">Photo</Label>
            {teacher?.photoUrl ? (
              <div className="space-y-3">
                <img
                  src={teacher.photoUrl}
                  alt={teacher.fullName}
                  className="h-32 w-32 rounded-xl object-cover"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" name="clearPhoto" value="true" />
                    Remove current photo
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Upload a new file to replace it, or tick remove to clear the current photo.
                  </p>
                </div>
              </div>
            ) : null}
            <Input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
          </div>

          {teacher?.subjects?.length ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Current subjects</p>
              <div className="flex flex-wrap gap-2">
                {teacher.subjects.map((subject) => (
                  <Badge key={subject.id} variant="secondary">
                    {subject.name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button asChild variant="outline">
              <Link href="/admin/teachers">Cancel</Link>
            </Button>
            <Button type="submit">{isNew ? "Create Teacher" : "Save Changes"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
