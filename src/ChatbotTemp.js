import { useState, useRef, useEffect } from "react";

function Chatbot() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]); // Store conversation history
  const [loading, setLoading] = useState(false);

  // Queue and speaking state refs
  const ttsQueue = useRef([]);
  const isSpeaking = useRef(false);

  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);
  

  const enqueueTTS = (text) => {
    ttsQueue.current.push(text);
    processQueue();
  };

  const processQueue = () => {
    if (isSpeaking.current || ttsQueue.current.length === 0) return;

    const nextText = ttsQueue.current.shift();
    if (!nextText) return;

    const utterance = new SpeechSynthesisUtterance(nextText);
    utterance.lang = "en-US";
    isSpeaking.current = true;

    utterance.onend = () => {
      isSpeaking.current = false;
      processQueue(); // Speak the next one
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMessage = { role: "user", content: input };
    const updatedMessages = [...messages, newMessage]; // Add user input to chat history

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    // Add empty assistant message before streaming starts
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3.2", // Change this to your preferred model
          messages: updatedMessages, // Send full chat history
          stream: true, // Enable streaming responses
        }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let botResponse = "";
      let ttsBuffer = ""; // Buffer for TTS
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line) => line.trim() !== ""); // Handle multiple JSON objects in a chunk

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line); // Parse the JSON object
            if (parsed.message && parsed.message.content) {
              const partialContent = parsed.message.content;
              botResponse += partialContent; // Append the content to the response
              ttsBuffer += partialContent; // Append to TTS buffer

              // Update the chat with the partial response
              setMessages((prevMessages) => {
                const updated = [...prevMessages];
                const lastIndex = updated.length - 1;
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  content: botResponse,
                };
                return updated;
              });

              let sentenceEndRegex = /[.!?]\s.$/;
              // Enqueue TTS when a sentence ends or buffer is large enough
              if (sentenceEndRegex.test("ttsBuffer") || ttsBuffer.length > 200) {
                enqueueTTS(ttsBuffer);
                ttsBuffer = ""; // Clear the buffer after enqueuing
              }
            }
          } catch (err) {
            console.error("Error parsing JSON chunk:", err);
          }
        }
      }

      // Enqueue any remaining buffer content
      if (ttsBuffer) {
        enqueueTTS(ttsBuffer.trim());
        ttsBuffer = ""; // Clear the buffer after enqueuing
      }
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
      setMessages((prev) => [...prev, { role: "assistant", content: "Oops! Something went wrong." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "auto", padding: 20 }}>
      <h2>Ollama Chatbot</h2>
      <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #ccc", padding: 10 }}>
        {messages.map((msg, index) => (
          <p key={index} style={{ textAlign: msg.role === "user" ? "right" : "left" }}>
            <strong>{msg.role === "user" ? "You: " : "Bot: "}</strong> {msg.content}
          </p>
        ))}
      </div>
      <textarea
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        rows="4"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type your message..."
        style={{ width: "100%", padding: 10 }}
      />
      <button onClick={handleSend} disabled={loading} style={{ marginTop: 10 }}>
        {loading ? "Thinking..." : "Send"}
      </button>
    </div>
  );
}

export default Chatbot;
