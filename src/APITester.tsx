import React, { useState, useEffect } from "react";

export function APITester() {
  const [endpoint, setEndpoint] = useState('/api/hello');
  const [token, setToken] = useState('');
  const [method, setMethod] = useState('GET');
  const [status, setStatus] = useState('-');
  const [remaining, setRemaining] = useState('-');
  const [resetTime, setResetTime] = useState('-');
  const [response, setResponse] = useState('No response yet...');
  const [stats, setStats] = useState('');
  const [requestLog, setRequestLog] = useState<string[]>(['Request log will appear here...']);
  const [isLoading, setIsLoading] = useState(false);
  
  // Add a log entry
  const addLogEntry = (message: string) => {
    setRequestLog(prev => {
      const newLog = [`${new Date().toLocaleTimeString()}: ${message}`, ...prev];
      return newLog.slice(0, 50); // Limit log entries
    });
  };
  
  // Make a request with the selected parameters
  const makeRequest = async () => {
    try {
      setIsLoading(true);
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(endpoint, {
        method,
        headers
      });
      
      const responseText = await response.text();
      
      try {
        const jsonResponse = JSON.parse(responseText);
        setResponse(JSON.stringify(jsonResponse, null, 2));
        
        // Update rate limit info
        setStatus(response.status === 429 ? 'Rate Limited (429)' : 'Success');
        setRemaining(response.headers.get('X-RateLimit-Remaining') || '-');
        
        const resetTimeHeader = response.headers.get('X-RateLimit-Reset');
        if (resetTimeHeader) {
          const date = new Date(parseInt(resetTimeHeader) * 1000);
          setResetTime(date.toLocaleTimeString());
        } else {
          setResetTime('-');
        }
        
        // Log the result
        const logMessage = `${response.status} ${response.statusText} - Remaining: ${remaining}`;
        addLogEntry(logMessage);
      } catch (error) {
        setResponse(responseText);
        console.error('Error parsing response:', error);
      }
    } catch (error) {
      setResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
      console.error('Request failed:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Send a burst of requests
  const sendBurstRequests = async () => {
    setIsLoading(true);
    
    for (let i = 0; i < 10; i++) {
      await makeRequest();
      // Small delay to ensure sequence
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    setIsLoading(false);
  };
  
  // Get rate limit stats
  const getStats = async () => {
    try {
      const response = await fetch('/api/rate-limit-stats');
      const stats = await response.json();
      setStats(JSON.stringify(stats, null, 2));
    } catch (error) {
      setStats(`Error getting stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Load initial stats
  useEffect(() => {
    getStats();
  }, []);

  // Handle endpoint and method selection
  const handleEndpointChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === "hello-get") {
      setEndpoint('/api/hello');
      setMethod('GET');
    } else if (selected === "hello-put") {
      setEndpoint('/api/hello');
      setMethod('PUT');
    } else if (selected === "hello-name") {
      setEndpoint('/api/hello/world');
      setMethod('GET');
    }
  };
  
  return (
    <div className="rate-limiter" style={{ color: 'black' }}>
      <div className="container" style={{ display: 'flex', gap: '2rem' }}>
        <div className="panel" style={{ flex: 1, border: '1px solid #ddd', borderRadius: '4px', padding: '1rem', backgroundColor: '#f9f9f9', color: 'black' }}>
          <h2 style={{ color: 'black' }}>Make API Requests</h2>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="endpoint-select" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: 'black' }}>Endpoint:</label>
            <select 
              id="endpoint-select" 
              onChange={handleEndpointChange}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '1rem', color: 'black' }}
            >
              <option value="hello-get">GET /api/hello</option>
              <option value="hello-put">PUT /api/hello</option>
              <option value="hello-name">GET /api/hello/world</option>
            </select>
          </div>
          
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label htmlFor="token-select" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: 'black' }}>User Token:</label>
            <select 
              id="token-select"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '1rem', color: 'black' }}
            >
              <option value="">No token (anonymous)</option>
              <option value="test-free-user">Free User</option>
              <option value="test-premium-user">Premium User</option>
              <option value="test-admin-user">Admin User</option>
            </select>
          </div>
          
          <button 
            onClick={makeRequest} 
            disabled={isLoading}
            style={{ width: '100%', padding: '0.75rem', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '1rem' }}
          >
            Send Request
          </button>
          
          <div className="rate-info" style={{ marginTop: '1rem', padding: '0.5rem', backgroundColor: '#e9f7fe', borderRadius: '4px', color: 'black' }}>
            <div>Status: <span style={{ color: status.includes('429') ? '#e74c3c' : '#27ae60', fontWeight: 'bold' }}>{status}</span></div>
            <div>Remaining: <span>{remaining}</span></div>
            <div>Reset: <span>{resetTime}</span></div>
          </div>
          
          <button 
            onClick={sendBurstRequests} 
            disabled={isLoading}
            style={{ width: '100%', padding: '0.75rem', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '1rem' }}
          >
            Send 10 Requests in Burst
          </button>
          
          <div className="request-log" style={{ marginTop: '1rem', maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', padding: '0.5rem', fontSize: '0.9rem', color: 'black' }}>
            {requestLog.map((log, index) => (
              <div key={index} style={{ padding: '0.25rem 0', borderBottom: '1px solid #eee', color: 'black' }}>{log}</div>
            ))}
          </div>
        </div>
        
        <div className="panel" style={{ flex: 1, border: '1px solid #ddd', borderRadius: '4px', padding: '1rem', backgroundColor: '#f9f9f9', color: 'black' }}>
          <h2 style={{ color: 'black' }}>Response</h2>
          <div 
            className="response-area" 
            style={{ 
              overflow: 'auto', 
              maxHeight: '300px', 
              padding: '1rem', 
              backgroundColor: '#f0f0f0', 
              borderRadius: '4px', 
              fontFamily: 'monospace', 
              whiteSpace: 'pre-wrap',
              color: 'black'
            }}
          >
            {response}
          </div>
          
          <div className="stats-container" style={{ marginTop: '2rem', color: 'black' }}>
            <h3 style={{ color: 'black' }}>Rate Limit Stats</h3>
            <button 
              onClick={getStats}
              style={{ 
                width: '100%', 
                padding: '0.75rem', 
                backgroundColor: '#3498db', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px', 
                cursor: 'pointer', 
                marginTop: '1rem' 
              }}
            >
              Refresh Stats
            </button>
            <div 
              style={{ 
                marginTop: '1rem', 
                maxHeight: '300px', 
                overflow: 'auto',
                padding: '1rem', 
                backgroundColor: '#f0f0f0', 
                borderRadius: '4px', 
                fontFamily: 'monospace', 
                whiteSpace: 'pre-wrap',
                color: 'black'
              }}
            >
              {stats}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
