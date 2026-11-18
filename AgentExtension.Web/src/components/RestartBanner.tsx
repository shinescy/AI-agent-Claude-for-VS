// 「下个会话才生效」横幅。

import { useT } from '../LangContext';

interface RestartBannerProps {
  onDismiss: () => void;
}

export function RestartBanner({ onDismiss }: RestartBannerProps) {
  const t = useT();

  return (
    <div className="panel-restart-banner">
      <span>{t('改动将在下个会话生效。')}</span>
      <button type="button" onClick={onDismiss}>{t('知道了')}</button>
    </div>
  );
}
