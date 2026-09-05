import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // 产物通过 WebView2 的虚拟主机映射加载，资源引用必须是相对路径。
  base: './',

  build: {
    // 直接产到 VSIX 项目的 webview 目录，由 csproj 打包进 VSIX。
    outDir: '../AgentExtension/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // 文件名必须带内容哈希。页面是通过 SetVirtualHostNameToFolderMapping 用
        // **https:// 的 URL** 加载的，HTTP 缓存语义完整适用；名字固定不变时，
        // WebView2 会一直拿缓存里的旧 bundle——表现为「装了新版但界面毫无变化」，
        // 而且部署侧的一切校验（时间戳、哈希、grep 产物）全是绿的，因为文件确实换了，
        // 只是根本没被加载。2026-08-20 实测踩到：连续几次部署，用户看到的都是旧代码。
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },

  server: {
    port: 5173,
    strictPort: true,
  },

  // 组件测试需要 DOM。全局开 jsdom：现有的纯逻辑测试不依赖 node 独有 API，
  // 在 jsdom 下照常通过，不必按文件区分环境。
  // globals: true 是 @testing-library/react 自动挂载 afterEach(cleanup) 的前提——
  // 它探测的是全局 afterEach，不开 globals 就探测不到，上一个用例渲染的 DOM
  // 会残留到下一个用例，导致同名元素重复命中。
  test: {
    environment: 'jsdom',
    globals: true,
    // jsdom 缺 scrollIntoView 等布局相关 API，在这里补位。
    // 不补的话每次 run 都甩一串 Unhandled Errors，真出问题时那条会混在里面看不见。
    setupFiles: ['./src/testSetup.ts'],
  },
});
