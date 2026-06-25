import { BadgeCheck, CircleAlert, CircleHelp, CircleX, Layers3 } from "lucide-react";
import type { ProfessionalReport } from "../lib/professionalProfiles";

interface ProfessionalProfilePanelProps {
  report: ProfessionalReport;
}

const severityIcon = {
  danger: <CircleX size={14} />,
  info: <CircleHelp size={14} />,
  warn: <CircleAlert size={14} />,
};

export function ProfessionalProfilePanel({ report }: ProfessionalProfilePanelProps) {
  return (
    <div className="profile-panel">
      <strong><Layers3 size={15} /> Professional Mode</strong>
      <div className="profile-panel-head">
        <div>
          <span>{report.profile.shortLabel}</span>
          <small>{report.profile.previewHint}</small>
        </div>
        <b>{report.score}</b>
      </div>
      <p>{report.profile.description}</p>
      {report.issues.length > 0 ? (
        <ul className="profile-issues">
          {report.issues.map((issue) => (
            <li key={`${issue.code}-${issue.line || 0}`} className={issue.severity}>
              {severityIcon[issue.severity]}
              <span>{issue.line ? `L${issue.line}: ` : ""}{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="profile-empty">
          <BadgeCheck size={15} />
          <span>No profile-specific warnings.</span>
        </div>
      )}
      {report.strengths.length > 0 && (
        <div className="profile-strengths">
          {report.strengths.map((item) => <span key={item}>{item}</span>)}
        </div>
      )}
    </div>
  );
}
