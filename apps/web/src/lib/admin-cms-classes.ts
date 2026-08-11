/** Tailwind utility bundles for admin/CMS form primitives. */

export const panelTitleClass =
  "mb-4 flex items-center justify-between gap-3.5 [&_h2]:m-0 [&_h2]:text-[clamp(24px,3vw,34px)] [&_span]:rounded-full [&_span]:border [&_span]:border-brand-gold/35 [&_span]:bg-brand-gold/10 [&_span]:px-3 [&_span]:py-2 [&_span]:text-[13px] [&_span]:font-extrabold [&_span]:text-brand-gold [&_p]:m-0 [&_p]:text-sm [&_p]:text-sand-muted";

export const dataRowClass =
  "mt-2.5 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-[#eee5da] transition hover:-translate-y-px hover:border-brand-gold/25 hover:bg-white/[0.075] [&_span]:grid [&_span]:min-w-0 [&_span]:gap-0.5 [&_span]:break-words [&_span]:text-[13px] [&_span]:text-[#b8afa5] [&_strong]:truncate [&_strong]:text-[15px] [&_strong]:text-sand [&_small]:font-black [&_small]:text-brand-gold [&_a]:font-black [&_a]:text-brand-gold [&_a]:no-underline [&_button:not(.outline-button):not(.primary-button):not(.danger-button)]:grid [&_button:not(.outline-button):not(.primary-button):not(.danger-button)]:h-[38px] [&_button:not(.outline-button):not(.primary-button):not(.danger-button)]:w-[38px] [&_button:not(.outline-button):not(.primary-button):not(.danger-button)]:place-items-center [&_button:not(.outline-button):not(.primary-button):not(.danger-button)]:rounded-lg [&_button:not(.outline-button):not(.primary-button):not(.danger-button)]:border [&_button:not(.outline-button):not(.primary-button):not(.danger-button)]:border-white/15 [&_button:not(.outline-button):not(.primary-button):not(.danger-button)]:bg-white/[0.06] [&_button:not(.outline-button):not(.primary-button):not(.danger-button)]:text-[#ffd8d4] [&_select]:min-h-[38px] [&_select]:rounded-lg [&_select]:border [&_select]:border-white/15 [&_select]:bg-ink/75 [&_select]:px-2.5 [&_select]:font-extrabold [&_select]:text-sand [&_select:focus]:border-brand-gold/75 [&_select:focus]:bg-ink/[0.86] [&_select:focus]:shadow-[0_0_0_3px_rgba(240,180,90,0.12)]";

export const crudFormClass =
  "mb-4 grid grid-cols-2 gap-2.5 [&_input]:ui-input [&_input]:min-h-[44px] [&_input]:rounded-lg [&_select]:ui-input [&_select]:min-h-[44px] [&_select]:rounded-lg [&_textarea]:ui-input [&_textarea]:col-span-full [&_textarea]:min-h-24 [&_textarea]:resize-y [&_textarea]:py-3 [&_button]:col-span-full";

export const crudFormInlineClass = `${crudFormClass} grid-cols-[minmax(220px,1.2fr)_repeat(3,minmax(130px,0.7fr))_auto] [&_button]:col-auto`;

export const wideFieldClass = "col-span-full";

export const cmsFormClass =
  "items-end [&_label]:grid [&_label]:min-w-0 [&_label]:gap-2 [&_label]:text-[13px] [&_label]:font-black [&_label]:text-[#efe5d9]";

export const cmsFormSectionTitleClass =
  "col-span-full mt-1 flex items-start gap-3 border-t border-white/10 pt-[18px] first:mt-0 first:border-t-0 first:pt-0 [&>span]:shrink-0 [&>span]:rounded-md [&>span]:border [&>span]:border-brand-mint/40 [&>span]:bg-brand-mint/10 [&>span]:px-2 [&>span]:py-1.5 [&>span]:text-[11px] [&>span]:font-black [&>span]:uppercase [&>span]:text-brand-mint [&_h3]:m-0 [&_h3]:mb-1 [&_h3]:text-[17px] [&_h3]:text-white [&_p]:m-0 [&_p]:text-[13px] [&_p]:leading-snug [&_p]:text-[#b8c4bd]";

const cmsUploadFieldBase =
  "content-center min-h-[152px] rounded-lg border border-dashed border-brand-gold/45 bg-[linear-gradient(180deg,rgba(240,180,90,0.08),rgba(255,255,255,0.035)),rgba(7,8,10,0.32)] p-[18px] text-brand-gold [&_strong]:text-base [&_strong]:text-sand [&_small]:leading-snug [&_small]:text-[#b8afa5] [&_input]:min-h-[42px] [&_input]:p-2.5";

export const cmsUploadFieldClass = `${cmsUploadFieldBase} col-span-full`;
export { cmsUploadFieldBase };

const cmsImagePreviewBase =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 rounded-lg border border-white/15 bg-white/[0.035] p-2.5 [&_img]:max-h-[180px] [&_img]:w-full [&_img]:rounded-md [&_img]:object-cover [&_video]:aspect-video [&_video]:max-h-[260px] [&_video]:w-full [&_video]:rounded-md [&_video]:border-0 [&_video]:bg-black [&_iframe]:aspect-video [&_iframe]:max-h-[260px] [&_iframe]:w-full [&_iframe]:rounded-md [&_iframe]:border-0 [&_iframe]:bg-black [&_audio]:max-h-[54px] [&_audio]:w-full [&_audio]:rounded-md [&_button]:rounded-lg [&_button]:border [&_button]:border-white/15 [&_button]:bg-white/[0.06] [&_button]:px-3 [&_button]:py-2 [&_button]:text-sm [&_button]:font-black [&_button]:text-[#ffd8d4] hover:[&_button]:border-[#ffd8d4]/40 hover:[&_button]:bg-brand-ember/15";

export const cmsImagePreviewClass = `${cmsImagePreviewBase} col-span-full`;

export const cmsImagePreviewMetaClass = "flex min-w-0 flex-col items-start gap-1.5";

export const cmsFilterBarClass =
  "col-span-full my-1 mb-3 flex items-end justify-between gap-3 rounded-[10px] border border-white/12 bg-white/[0.03] p-2.5 px-3";

export const cmsStudioCardClass =
  "rounded-lg border border-white/10 bg-white/[0.035] p-[clamp(16px,3vw,24px)]";

export const dangerButtonClass = "border-[#ffd8d4]/25 text-[#ffd8d4] hover:border-[#ffd8d4]/40 hover:bg-brand-ember/15";

export const cmsDataRowThumbClass =
  "h-11 w-11 rounded-lg border border-white/10 object-cover";
