const url = "https://api.openai.com/v1/chat/completions";
const apiKey = `XXX`;

const controller = new AbortController();
const conversations = {};

async function askAI(question, senderTabId) {
  const { pageText, role, history } = conversations[senderTabId];

  history.push({ role: "user", content: question });

  let messages = [
    { role: "system", content: `Context: ${pageText}` },
    ...history.map((entry) => ({
      role: entry.role,
      content: entry.content,
    }))
  ];

  console.log("Messages: ", messages);
  
  try {
    const stream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: messages,
        temperature: 0.6,
        model: "gpt-3.5-turbo",
        max_tokens: 200,
        stream: true,
      }),
      signal: controller.signal,
    });

    const decoder = new TextDecoder();
    let response = "";

    for await (const chunk of stream.body) {
      const decodedChunk = decoder.decode(chunk);
      const lines = decodedChunk
        .split("\n")
        .map((line) => line.replace("data: ", ""))
        .filter((line) => line.length > 0)
        .filter((line) => line.length > 0 && line !== "[DONE]");

      for (const line of lines) {
        try {
          const parsedLine = JSON.parse(line);
        const {
          choices: [
            {
              delta: { content },
            },
          ],
        } = parsedLine;

        if (content) {
          response += content;
          chrome.tabs.sendMessage(senderTabId, {
            action: "partialResponse",
            text: content,
          });
        }
      }catch (error) {
        console.error("Error parsing line: ", line, error);
      }
    }

    }

    history.push({ role: "assistant", content: response });

    chrome.tabs.sendMessage(senderTabId, { action: "streamEnd" });
  } catch (error) {
    console.error("Error asking AI:", error);
    chrome.tabs.sendMessage(senderTabId, {
      action: "error",
      text: "Error asking AI. Please try again later.",
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "askAI") {
    const senderTabId = sender.tab.id;

    if (!conversations[senderTabId]) {
      conversations[senderTabId] = {
        pageText: message.pageText,
        role: "system",
        history: [],
      };
    }
    askAI(message.question, senderTabId);
    return true;
  }
});
