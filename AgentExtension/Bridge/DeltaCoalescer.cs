// 把高频文本增量合并成一帧一条，避免打爆消息桥

using System;
using System.Text;
using AgentExtension.Agents;

namespace AgentExtension.Bridge
{
    /// <summary>合并连续的同类文本增量。</summary>
    public class DeltaCoalescer
    {
        #region 字段

        private readonly Action<AgentEvent> _emit;
        private readonly StringBuilder _buffer = new StringBuilder();

        private AgentEventKind? _bufferedKind;

        #endregion

        #region 构造

        public DeltaCoalescer(Action<AgentEvent> emit)
        {
            _emit = emit ?? throw new ArgumentNullException(nameof(emit));
        }

        #endregion

        #region 入队与冲刷

        /// <summary>收下一条事件。</summary>
        public void Enqueue(AgentEvent evt)
        {
            if (evt == null)
            {
                return;
            }

            bool isText = evt.Kind == AgentEventKind.AssistantText || evt.Kind == AgentEventKind.Thinking;

            if (!isText)
            {
                Flush();
                _emit(evt);
                return;
            }

            // 正文与思考语义不同，切换种类时必须先把上一种冲掉，否则思考内容会混进正文。
            if (_bufferedKind.HasValue && _bufferedKind.Value != evt.Kind)
            {
                Flush();
            }

            _bufferedKind = evt.Kind;
            _buffer.Append(evt.Content);
        }

        /// <summary>把缓冲里的文本合成一条事件发出。</summary>
        public void Flush()
        {
            if (!_bufferedKind.HasValue || _buffer.Length == 0)
            {
                _bufferedKind = null;
                _buffer.Clear();
                return;
            }

            string text = _buffer.ToString();
            AgentEventKind kind = _bufferedKind.Value;

            _buffer.Clear();
            _bufferedKind = null;

            AgentEvent merged = kind == AgentEventKind.Thinking
                ? AgentEvent.ThinkingText(text)
                : AgentEvent.Text(text);

            _emit(merged);
        }

        /// <summary>
        /// 丢弃缓冲里尚未冲刷的文本，不触发 emit。
        ///
        /// 用于会话被整个丢弃、界面要归零的场景（开新会话）：这时缓冲里剩的是上一条会话的
        /// 半句话，冲出去反而是把它当成新会话的输出发出去，必须原地扔掉而不是 <see cref="Flush"/>。
        /// </summary>
        public void Discard()
        {
            _bufferedKind = null;
            _buffer.Clear();
        }

        #endregion
    }
}
