// 应用入口：挂载 React 根。

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// xterm 自带的样式必须引，否则终端渲染出来是错位的字符堆。
import '@xterm/xterm/css/xterm.css';
import './styles.css';

const container = document.getElementById('root');
if (!container)
{
  throw new Error('未找到 #root 挂载点');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
