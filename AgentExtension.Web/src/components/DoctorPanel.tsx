// 健康检查面板：doctor 是纯文本，靠缩进表达层级，必须 pre-wrap 原样显示。

interface DoctorPanelProps {
  rawText: string;
}

export function DoctorPanel({ rawText }: DoctorPanelProps) {
  return <pre className="panel-plain-text">{rawText}</pre>;
}
