// 会话信息条：输入框底部那一栏。

import { useState } from 'react';
import type { AgentModelInfo, AgentSessionInfo } from '../types';
import { MODEL_BRANDS, buildModelOptions } from '../models';
import { OptionPicker } from './OptionPicker';
import { useT } from '../LangContext';

interface SessionInfoBarProps {
  session: AgentSessionInfo | null;

  /** 当前品牌 id。 */
  brand: string;
  onBrandChange: (brand: string) => void;

  /** 下拉当前选中的模型请求值。 */
  selectedModel: string;
  onModelChange: (model: string) => void;

  /** CLI 通过 initialize 握手汇报的模型清单；空数组表示没拿到，退回内置静态清单。 */
  reportedModels: AgentModelInfo[];

  /** `/model` 探测到的可选模型取值；空数组表示没探到。 */
  availableModels: string[];

  /** 生成过程中禁用会重启进程的那些选项。 */
  busy: boolean;

  /** 打开 status 面板。 */
  onOpenStatus: () => void;
}

/** 把路径压到能放进一行。 */
export function shortenPath(path: string, maxLength = 40): string {
  if (path.length <= maxLength) {
    return path;
  }

  const separator = path.includes('\\') ? '\\' : '/';
  const parts = path.split(separator).filter((p) => p !== '');
  const kept: string[] = [];
  let length = 0;

  for (let i = parts.length - 1; i >= 0; i--) {
    if (length + parts[i].length + 1 > maxLength - 2) {
      break;
    }

    kept.unshift(parts[i]);
    length += parts[i].length + 1;
  }

  if (kept.length === 0) {
    // 单段就已经超长（比如一个极长的目录名），只能硬截尾部。
    return '…' + path.slice(-(maxLength - 1));
  }

  return '…' + separator + kept.join(separator);
}

export function SessionInfoBar(props: SessionInfoBarProps) {
  const {
    session, brand, onBrandChange, selectedModel, onModelChange,
    reportedModels, availableModels, busy, onOpenStatus,
  } = props;

  const t = useT();
  const [modelOpen, setModelOpen] = useState(false);
  const modelOptions = buildModelOptions(availableModels, reportedModels);

  return (
    <div className="session-bar" role="status">
      {/* 品牌 → 型号两级。适配层本就按多代理设计，品牌单独一层是为将来接入别家产品留的位置。
          即便当前只有一家也照常显示：它表达的是「这套界面能接多家」这件事本身。 */}
      <label
        className="session-bar-control"
        title={t('模型品牌。目前只实现了 Claude 适配器。')}
      >
        <span className="status-caption">{t('品牌')}</span>
        <select
          className="status-select"
          value={brand}
          disabled={busy}
          onChange={(e) => onBrandChange(e.target.value)}
        >
          {MODEL_BRANDS.map((b) => (
            <option key={b.id} value={b.id} disabled={!b.available}>
              {b.available ? b.label : t('{label}（未接入）', { label: b.label })}
            </option>
          ))}
        </select>
      </label>

      {/* 型号用选项框而非裸下拉：每一项都要带说明，原生 select 装不下。
          选项框的面板本来就向上展开（bottom: 100%），放在底部这条栏里正合适。
          实际在跑的模型放进 title：选「默认」且探测失败时，标签上只有「默认」这三个字。 */}
      <div
        className="session-bar-control"
        title={session?.model ? t('CLI 实际使用：{model}', { model: session.model }) : ''}
      >
        <OptionPicker
          caption={t('型号')}
          options={modelOptions.map((m) => ({ value: m.value, label: t(m.label), description: t(m.hint) }))}
          value={selectedModel}
          onSelect={onModelChange}
          disabled={busy}
          width={300}
          open={modelOpen}
          onToggle={setModelOpen}
        />
      </div>

      {session === null
        ? <span className="session-bar-item session-bar-hint">{t('会话尚未启动')}</span>
        : <SessionFacts session={session} />}

      <span className="session-bar-spacer" />

      {session !== null && (
        <button type="button" className="session-bar-more" onClick={onOpenStatus}>
          {t('详情')} ›
        </button>
      )}
    </div>
  );
}

/** 会话起来之后才有的那几项事实。 */
function SessionFacts({ session }: { session: AgentSessionInfo }) {
  const t = useT();

  return (
    <>
      {session.cwd !== '' && (
        <>
          <span className="session-bar-sep">·</span>
          <span className="session-bar-item" title={session.cwd}>{shortenPath(session.cwd)}</span>
        </>
      )}

      <span className="session-bar-sep">·</span>
      <span className="session-bar-item">{t('MCP {n} 个', { n: session.mcpServers.length })}</span>

      {session.cliVersion !== '' && (
        <>
          <span className="session-bar-sep">·</span>
          <span className="session-bar-item">CLI {session.cliVersion}</span>
        </>
      )}
    </>
  );
}
