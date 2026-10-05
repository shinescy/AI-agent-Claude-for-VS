// 桥消息的 JSON 序列化

using System.IO;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AgentExtension.Bridge
{
    /// <summary>把出站消息序列化成信封 JSON。</summary>
    public static class BridgeSerializer
    {
        #region 选项

        /// <summary>序列化选项。</summary>
        public static readonly JsonSerializerOptions SerializerOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            Converters = { new JsonStringEnumConverter() }
        };

        private static readonly JsonWriterOptions WriterOptions = new JsonWriterOptions
        {
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };

        #endregion

        #region 序列化

        /// <summary>把一条出站消息包成 <c>{ type, payload }</c> 信封。</summary>
        public static string SerializeEnvelope(string type, object payload)
        {
            var buffer = new MemoryStream();

            using (var writer = new Utf8JsonWriter(buffer, WriterOptions))
            {
                writer.WriteStartObject();
                writer.WriteString("type", type);
                writer.WritePropertyName("payload");
                JsonSerializer.Serialize(writer, payload, payload.GetType(), SerializerOptions);
                writer.WriteEndObject();
            }

            string json = Encoding.UTF8.GetString(buffer.ToArray());
            return json;
        }

        #endregion
    }
}
