const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const {HttpsProxyAgent} = require('https-proxy-agent');

const firstMessage = "Generate a indicator to show the price potential of BTC in next 2 years?";
const CONFIG = {
  MAIN_URL: 'https://chat.chainopera.ai/api/agentopera',
  CHECKIN_URL: 'https://chat.chainopera.ai/api/agent/ai-terminal-check-in',
  TOKEN_FILE: 'token.txt',
  PROXY_FILE: 'proxy.txt',
  CHAT_INTERVAL: 60000,
  REQUEST_TIMEOUT: 30000,
  MAX_RETRIES: 5,
  PROMPT_MESSAGES: [
    "tell me 1 coin which have potential to be the leader of desci in future?",
    "tell me 1 coin which have potential to be the leader of RWA in future?",
    "Generate a indicator to show the price potential of Bitcion in next 2 years",
    "Howmuch money people lose money in FTX collapse and tell me detail how FTX collapse?",
    "Show me price of bitcoin in chart for 1week",
    "What is sequencer in blockchain,explain me like I am 5 years old",
    "How node verify data in blockchain,explain me like I am 5 yrs old",
    "What is the difference between a blockchain and a database?explain me like I am 5 yrs old",
    "Why gameFi era ended after axie infinity trend stopped?",
    "Why gala game token price is droping so hard?explain me with facts"
  ]
};

// get token from token file
function getAllTokens() {
  try {
    const fileContent = fs.readFileSync(CONFIG.TOKEN_FILE, 'utf8');
    const tokens = fileContent.split('\n')
      .map(token => token.trim())
      .filter(token => token.length > 0);
    
    if (tokens.length === 0) {
      console.error('No valid tokens found in token file');
      process.exit(1);
    }
    
    console.log(`Found ${tokens.length} token(s) in the token file`);
    return tokens;
  } catch (error) {
    console.error('Error reading token file:', error);
    process.exit(1);
  }
}

// get proxy from  proxies file
function getAllProxies() {
  try {
    if (!fs.existsSync(CONFIG.PROXY_FILE)) {
      console.log('No proxy file found. Running without proxies.');
      return [];
    }
    
    const fileContent = fs.readFileSync(CONFIG.PROXY_FILE, 'utf8');
    const proxies = fileContent.split('\n')
      .map(proxy => proxy.trim())
      .filter(proxy => proxy.length > 0);
    
    console.log(`Found ${proxies.length} proxy/proxies in the proxy file`);
    return proxies;
  } catch (error) {
    console.error('Error reading proxy file:', error);
    console.log('Running without proxies.');
    return [];
  }
}


function createCommonHeaders(token) {
  return {
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/json',
    'Origin': 'https://chat.chainopera.ai',
    'Referer': 'https://chat.chainopera.ai/chat',
    'Sec-Ch-Ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Cookie': `auth_token=${token}`
  };
}


function validateToken(token) {
  if (!token || token.trim() === '') {
    console.error('Token is empty or invalid');
    return false;
  }
  
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.error('Token does not appear to be in valid JWT format');
    return false;
  }
  
  return true;
}

// Create API client with proxy support
function createApiClient(token, proxy = null) {
  const config = {
    baseURL: CONFIG.MAIN_URL,
    headers: {
      ...createCommonHeaders(token),
      'X-Terminal-Source': '2',
    },
    timeout: CONFIG.REQUEST_TIMEOUT
  };
  
  if (proxy) {
    const httpsAgent = new HttpsProxyAgent(proxy);
    config.httpsAgent = httpsAgent;
    config.proxy = false;
  }
  
  return axios.create(config);
}


const checkIn = async (token, proxy = null) => {
  try {
    if (!validateToken(token)) {
      console.error('Invalid token format. Please check your token.txt file.');
      return false;
    }
    
    console.log('Attempting to check in...');
    
    const config = {
      baseURL: CONFIG.CHECKIN_URL,
      headers: {
        ...createCommonHeaders(token),
      },
      timeout: CONFIG.REQUEST_TIMEOUT
    };
    
    // Add proxy if provided
    if (proxy) {
      const httpsAgent = new HttpsProxyAgent(proxy);
      config.httpsAgent = httpsAgent;
      config.proxy = false;
    }
    
    const checkInClient = axios.create(config);
    
    // Add retry logic for check-in
    let retries = 0;
    while (retries <= CONFIG.MAX_RETRIES) {
      try {
        const response = await checkInClient.post('');
        
        if (response.data && response.data.checkIn === true) {
          console.log('Check-in successful!');
          return true;
        } else {
          return false;
        }
      } catch (retryError) {
        retries++;
        if (retries > CONFIG.MAX_RETRIES) {
          throw retryError;
        }
        await delay(retries * 2000);
      }
    }
    
    return false;
  } catch (error) {
    console.error('Check-in failed:', error.code || error.message);
    if (error.response) {
      console.error('Server response:', error.response.status, error.response.statusText);
    }
    return false;
  }
}

// Helper function to delay between retries
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to extract user ID from token
function extractUserIdFromToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.log('Cannot get userID from token. Please check your token.txt file.');
    }
    
    const payload = Buffer.from(parts[1], 'base64').toString();
    const data = JSON.parse(payload);
    
    if (data && data.id) {
      console.log(`userID: ${data.id}`);
      return data.id.toString();
    }
    
  } catch (error) {
    console.error('Error extracting userID from token:', error.message);
  }
}

async function sendMessage(apiClient, message, conversationId = null, retryCount = 0, userId = null) {
  try {
    // Create payload exactly matching the website format
    const payload = {
      agentName: "Market Sentiment Radar",
      group: "web",
      id: conversationId || uuidv4(),
      messages: [
        {
          role: "user", 
          content: message, 
          parts: [
            {
              type: "text", 
              text: message
            }
          ]
        }
      ],
      model: "crypto_sentiment_agent",
      userId: userId 
    };
    
    const response = await apiClient.post('', payload);
    
    if (response.data) {
      console.log('Message sent successfully!');
      
      // Extract conversation ID if this is a new conversation
      if (!conversationId && response.data.id) {
        console.log('New conversation created with ID:', response.data.id);
        return response.data.id;
      }
      
      return conversationId || payload.id;
    }
    
    return conversationId || payload.id;
  } catch (error) {
    if ((error.code === 'ECONNABORTED' || error.code === 'ERR_BAD_RESPONSE' || 
         error.message.includes('timeout') || error.message.includes('network')) 
        && retryCount < CONFIG.MAX_RETRIES) {
      console.log(`Request error: ${error.code || error.message}. Retrying in ${(retryCount + 1) * 2} seconds...`);
      await delay((retryCount + 1) * 2000);
      return sendMessage(apiClient, message, conversationId, retryCount + 1, userId);
    }
    
    console.error('Error sending message:', 
                 error.code || error.message);
    
    if (error.response) {
      console.error('Server response:', error.response.status, error.response.statusText);
    }
    return null;
  }
}


async function runBotWithToken(token, proxy, tokenIndex, totalTokens) {
  console.log(`\n=== Starting session with token ${tokenIndex + 1}/${totalTokens} ===`);
  if (proxy) {
    console.log(`=== Using proxy: ${proxy} ===\n`);
  } else {
    console.log(`=== No proxy specified for this token ===\n`);
  }
  
  try {
    if (!validateToken(token)) {
      console.error(`Invalid token at index ${tokenIndex + 1}. Skipping this token.`);
      return false;
    }
    console.log('Token validated successfully');
    
    // Perform check-in first
    const checkedIn = await checkIn(token, proxy);
    if (!checkedIn) {
      console.log(`Warning: Check-in failed for token ${tokenIndex + 1}, but continuing with bot operation...`);
    }
    
    // Extract user ID from token
    const userId = extractUserIdFromToken(token);
    
    const apiClient = createApiClient(token, proxy);
    let currentConversationId = null;
    
    // Send an initial message to create a conversation
    console.log('Creating new conversation...');
    currentConversationId = await sendMessage(apiClient, firstMessage, null, 0, userId);
    
    if (!currentConversationId) {
      console.error(`Failed to create a conversation after multiple attempts with token ${tokenIndex + 1}.`);
      return false;
    } else {
      console.log(`Successfully created/joined conversation with ID: ${currentConversationId}`);
    }
    
    console.log(`Bot will send ${CONFIG.PROMPT_MESSAGES.length} messages, one every ${CONFIG.CHAT_INTERVAL/1000} seconds.`);
    
    // Track which message we're on
    let messageIndex = 0;
    
    // Process all messages sequentially using promises
    return new Promise((resolve) => {
      const intervalId = setInterval(async () => {
        // Check if we've sent all messages
        if (messageIndex >= CONFIG.PROMPT_MESSAGES.length) {
          console.log(`All messages have been sent for token ${tokenIndex + 1}. Session complete.`);
          clearInterval(intervalId);
          resolve(true);
          return;
        }
        
        if (!currentConversationId) {
          currentConversationId = await sendMessage(apiClient, "Starting a new conversation.", null, 0, userId);
          if (!currentConversationId) {
            console.error('Failed to create a new conversation. Will try again next interval.');
            return;
          }
        }

        // Get the next message in sequence
        const message = CONFIG.PROMPT_MESSAGES[messageIndex];
        
        const result = await sendMessage(apiClient, message, currentConversationId, 0, userId);
        
        if (!result) {
          console.log('Failed to send message, will create new conversation next time');
          currentConversationId = null;
        } else {
          messageIndex++;
        }
      }, CONFIG.CHAT_INTERVAL);
    });
  } catch (error) {
    console.error(`Error in bot setup for token ${tokenIndex + 1}:`, error);
    return false;
  }
}

// Main function to run the bot with multiple tokens and proxies
async function runBot() {
  console.log('Starting multi-session chat bot with proxy support...');
  
  try {
    const tokens = getAllTokens();
    const proxies = getAllProxies();
    

    for (let i = 0; i < tokens.length; i++) {
      const proxy = i < proxies.length ? proxies[i] : null;
      
      const success = await runBotWithToken(tokens[i], proxy, i, tokens.length);
      if (success) {
        console.log(`Successfully completed session with token ${i + 1}/${tokens.length}`);
      } else {
        console.log(`Failed to complete session with token ${i + 1}/${tokens.length}`);
      }
    }
    
    console.log('All token sessions completed. Bot execution finished.');
    process.exit(0);
  } catch (error) {
    console.error('Error in bot setup:', error);
    process.exit(1);
  }
}

// Start the bot
runBot().catch(error => {
  console.error('Bot crashed:', error);
  process.exit(1);
});
