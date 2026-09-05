// 文件回滚面板：取代在本管线下被 CLI 拒绝的 /rewind（别名 /checkpoint /undo）。

import { useState } from 'react';
import type { PanelItemView } from '../panelState';
import { useT } from '../LangContext';

interface FileHistoryPanelProps {
  items: PanelItemView[];
  error?: string;
  loading?: boolean;
  /** 传条目 id（形如 `<快照名>|<绝对路径>`），不传路径——路径由宿主重读盘得出。 */
  onRestore: (itemId: string) => void;
}

export function FileHistoryPanel({ items, error = '', loading = false, onRestore }: FileHistoryPanelProps) {
  const t = useT();

  const [confirming, setConfirming] = useState('');

  const emptyText = loading || error !== '' || items.length > 0
    ? ''
    : t('本会话还没有文件改动记录。');

  return (
    <div className="panel-plain">
      <div className="panel-hint">
        {t('这些是 CLI 在改动文件前留下的快照，按时间倒序。还原会覆盖工作区里的文件，但覆盖前的内容会另存一份，路径写在转录里。')}
      </div>

      {emptyText !== '' && <div className="panel-empty">{emptyText}</div>}

      {items.map((item) => (
        <div key={item.id} className="panel-row">
          <span className="panel-row-title">{item.title}</span>
          <span className="panel-row-hint">v{item.fields['version']}</span>
          <span className="panel-row-sub">{item.fields['backupTime']}</span>
          <span className="panel-row-size">{item.fields['size']}</span>
          <span className="panel-row-path" title={item.fields['path']}>{item.subtitle}</span>

          {/* 快照文件已被 CLI 清理时 enabled 为 false：按钮点不动，并就地说明理由，
              否则用户只会看到一个灰按钮，无从判断是坏了还是不该点。 */}
          {!item.enabled ? (
            <span className="panel-row-scope">{t('快照已被清理')}</span>
          ) : confirming === item.id ? (
            <>
              <span className="panel-row-scope">{t('确定覆盖这个文件？')}</span>
              <button
                type="button"
                className="panel-action panel-action-danger"
                onClick={() => { setConfirming(''); onRestore(item.id); }}
              >
                {t('确定还原')}
              </button>
              <button type="button" className="panel-action" onClick={() => setConfirming('')}>
                {t('取消')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="panel-action"
              title={t('把这个文件覆盖成这一版；覆盖前的内容会另存一份')}
              onClick={() => setConfirming(item.id)}
            >
              {t('还原')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
