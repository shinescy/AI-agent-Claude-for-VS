// 槽位校验结论

namespace AgentExtension.Agents
{
    /// <summary>校验结论。</summary>
    public class SlotValidationResult
    {
        public bool Accepted { get; set; }

        public string Reason { get; set; } = string.Empty;

        public static SlotValidationResult Accept()
        {
            return new SlotValidationResult { Accepted = true };
        }

        public static SlotValidationResult Reject(string reason)
        {
            return new SlotValidationResult { Accepted = false, Reason = reason };
        }
    }
}
