import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const files = [
  "../src/components/admin/AdminView.tsx",
  "../src/components/admin/AdminDashboardOverview.tsx",
  "../src/components/admin/AdminReports.tsx"
].map((f) => path.join(__dirname, f));

const importLine = `import {
  cmsFilterBarClass,
  cmsFormClass,
  cmsFormSectionTitleClass,
  cmsImagePreviewClass,
  cmsImagePreviewMetaClass,
  cmsStudioCardClass,
  cmsUploadFieldClass,
  cmsUploadFieldBase,
  cmsDataRowThumbClass,
  crudFormClass,
  crudFormInlineClass,
  dangerButtonClass,
  dataRowClass,
  panelTitleClass,
  wideFieldClass
} from "../../lib/admin-cms-classes";`;

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");

  if (!content.includes("admin-cms-classes")) {
    const anchor = file.includes("AdminView")
      ? 'import { studentLocationLabel } from "../../lib/locations";'
      : 'import { formatPriceInBRL }';
    content = content.replace(anchor, `${anchor}\n${importLine}`);
  }

  const replacements = [
    ['className="panel-title cms-subtitle"', 'className={`${panelTitleClass} cms-subtitle`}'],
    ['className="panel-title"', 'className={panelTitleClass}'],
    ['className="crud-form cms-form"', 'className={`${crudFormClass} ${cmsFormClass}`}'],
    ['className="crud-form inline-form"', 'className={crudFormInlineClass}'],
    ['className="crud-form admin-student-profile-form"', 'className={`${crudFormClass} admin-student-profile-form`}'],
    ['className="crud-form"', 'className={crudFormClass}'],
    ['className="cms-form-section-title wide-field"', 'className={cmsFormSectionTitleClass}'],
    ['className="cms-upload-field wide-field"', 'className={cmsUploadFieldClass}'],
    ['className="cms-upload-field"', 'className={cmsUploadFieldBase}'],
    ['className="cms-image-preview wide-field"', 'className={cmsImagePreviewClass}'],
    ['className="cms-image-preview-meta"', 'className={cmsImagePreviewMetaClass}'],
    ['className="cms-filter-bar wide-field"', 'className={cmsFilterBarClass}'],
    ['className="cms-filter-bar"', 'className={cmsFilterBarClass}'],
    ['className="cms-studio-card cms-trash-panel"', 'className={`${cmsStudioCardClass} cms-trash-panel`}'],
    ['className="cms-program-section cms-studio-card"', 'className={`cms-program-section ${cmsStudioCardClass}`}'],
    ['className="cms-studio-card"', 'className={cmsStudioCardClass}'],
    ['className="outline-button danger-button"', 'className={`outline-button ${dangerButtonClass}`}'],
    ['className="danger-button"', 'className={dangerButtonClass}'],
    ['className="wide-field"', 'className={wideFieldClass}'],
    ['className="cms-data-row-thumb"', 'className={cmsDataRowThumbClass}'],
    ['className="data-row cms-data-row cms-trash-item"', 'className={`${dataRowClass} cms-data-row cms-trash-item`}'],
    ['className="data-row cms-data-row cms-lessons-row', 'className={`${dataRowClass} cms-data-row cms-lessons-row'],
    ['className="data-row cms-data-row cms-sortable-row', 'className={`${dataRowClass} cms-data-row cms-sortable-row'],
    ['className="data-row cms-data-row"', 'className={`${dataRowClass} cms-data-row`}'],
    ['className="data-row ticket-row"', 'className={`${dataRowClass} ticket-row`}'],
    ['className="data-row"', 'className={dataRowClass}']
  ];

  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }

  fs.writeFileSync(file, content);
  console.log("Updated", path.basename(file));
}
