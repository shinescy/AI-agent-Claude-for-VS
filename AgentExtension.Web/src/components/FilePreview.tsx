// 一张文件预览卡片：在面板里就地看文件，不用切到编辑器。

import { useT } from '../LangContext';
import { useFilePreview } from '../useFilePreview';
import { fenceFor, previewLanguage } from '../previewLanguage';
import { sendOpenFile } from '../bridge';
import { Markdown } from './Markdown';

interface FilePreviewProps {
  path: string;
  onClose: () => void;
}

/** 把字节数说成人话。 */
function describeSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePreview({ path, onClose }: FilePreviewProps) {
  const t = useT();
  const state = useFilePreview(path);

  return (
    <div className="file-preview">
      <div className="file-preview-head">
        <span className="file-preview-path" title={path}>{path}</span>
        {state.status === 'ready' && state.data.error.length === 0 && (
          <span className="file-preview-meta">
            {state.data.image.length > 0
              ? describeSize(state.data.size)
              : t('{shown} / {total} 行 · {size}', {
                  shown: String(state.data.text.length === 0 ? 0 : state.data.text.split('\n').length),
                  total: String(state.data.totalLines),
                  size: describeSize(state.data.size),
                })}
          </span>
        )}
        <button
          type="button"
          className="file-preview-action"
          onClick={() => sendOpenFile(path, 1)}
        >
          {t('在 VS 里打开')}
        </button>
        <button
          type="button"
          className="file-preview-action"
          title={t('收起')}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="file-preview-body">
        {state.status !== 'ready' && (
          <div className="file-preview-hint">{t('正在读取…')}</div>
        )}
        {state.status === 'ready' && state.data.error.length > 0 && (
          // 读不到必须把原因说出来：留一块空白，用户只会以为整个功能坏了。
          <div className="file-preview-error">{state.data.error}</div>
        )}
        {state.status === 'ready' && state.data.error.length === 0 && state.data.image.length > 0 && (
          <img className="file-preview-image" src={state.data.image} alt={path} />
        )}
        {state.status === 'ready' && state.data.error.length === 0 && state.data.image.length === 0 && (
          <Markdown
            text={`${fenceFor(state.data.text)}${previewLanguage(path)}\n${state.data.text}\n${fenceFor(state.data.text)}`}
          />
        )}
        {state.status === 'ready' && state.data.truncated && (
          <div className="file-preview-hint">
            {t('只显示了前一部分，完整内容请在 VS 里打开。')}
          </div>
        )}
      </div>
    </div>
  );
}
