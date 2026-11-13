import { useEffect, useRef, useState } from 'react';

const EMPTY_CONTEXT = {
    context: '',
    expected_frequency_hz: '',
    expected_voltage_rms_v: ''
};

export default function AiAssistantPanel() {
    const [context, setContext] = useState(EMPTY_CONTEXT);
    const [messages, setMessages] = useState([]);
    const [question, setQuestion] = useState('');
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [monitorBusy, setMonitorBusy] = useState(false);
    const [error, setError] = useState('');
    const chatEndRef = useRef(null);

    useEffect(() => {
        let active = true;
        const refresh = async () => {
            try {
                const response = await fetch('/api/ai/status');
                if (!response.ok) throw new Error('AI service is not responding. Start the Python service.');
                const nextStatus = await response.json();
                if (active) setStatus(nextStatus);
            } catch {
                if (active) setStatus(null);
            }
        };
        refresh();
        const timer = window.setInterval(refresh, 4000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [messages]);

    const requestPayload = () => ({
        context: context.context,
        expected_frequency_hz: parseOptionalNumber(context.expected_frequency_hz),
        expected_voltage_rms_v: parseOptionalNumber(context.expected_voltage_rms_v)
    });

    const analyze = async () => {
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/ai/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload())
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Could not analyze the current capture.');
            setStatus((previous) => previous ? { ...previous, latest_insight: result } : previous);
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setBusy(false);
        }
    };

    const toggleMonitor = async (enabled) => {
        setMonitorBusy(true);
        setError('');
        try {
            const response = await fetch('/api/ai/monitor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...requestPayload(), enabled })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Could not update AI monitoring.');
            setStatus((previous) => previous ? { ...previous, monitor_enabled: result.monitor_enabled } : previous);
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setMonitorBusy(false);
        }
    };

    const sendMessage = async (event) => {
        event.preventDefault();
        const message = question.trim();
        if (!message || busy) return;
        const priorMessages = messages.slice(-10);
        setMessages((previous) => [...previous, { role: 'user', content: message }]);
        setQuestion('');
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...requestPayload(), message, history: priorMessages })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'The assistant could not answer.');
            setMessages((previous) => [...previous, { role: 'assistant', content: result.reply }]);
        } catch (requestError) {
            setError(requestError.message);
            setMessages((previous) => previous.filter((item, index) => index !== previous.length - 1));
            setQuestion(message);
        } finally {
            setBusy(false);
        }
    };

    const latestInsight = status?.latest_insight;
    const serviceLabel = !status
        ? 'Service offline'
        : !status.ai_configured ? 'API key needed'
            : !status.connected_to_stream ? 'Waiting for stream'
                : status.has_capture ? 'Ready' : 'Waiting for samples';

    return (
        <details className="control-group ai-assistant-panel">
            <summary className="ai-assistant-summary">
                <span>AI Assistant</span>
                <small className={status?.ai_configured && status?.connected_to_stream ? 'ready' : ''}>{serviceLabel}</small>
            </summary>
            <div className="ai-assistant-content">
                <div className="ai-service-status">
                    <small>{status?.model || 'Gemini model'}{status?.sample_rate_hz ? ` · ${status.channel_count} ch · ${(status.sample_rate_hz / 1000).toFixed(1)} kS/s` : ''}</small>
                </div>

                <label className="ai-field-label" htmlFor="ai-measurement-context">What are you measuring?</label>
                <textarea
                    id="ai-measurement-context"
                    rows="2"
                    maxLength="2000"
                    value={context.context}
                    placeholder="e.g. 50 Hz inverter output after the filter"
                    onChange={(event) => setContext((previous) => ({ ...previous, context: event.target.value }))}
                />
                <div className="ai-reference-inputs">
                    <label>Expected Hz<input type="number" min="0" step="any" value={context.expected_frequency_hz} onChange={(event) => setContext((previous) => ({ ...previous, expected_frequency_hz: event.target.value }))} /></label>
                    <label>Expected Vrms<input type="number" min="0" step="any" value={context.expected_voltage_rms_v} onChange={(event) => setContext((previous) => ({ ...previous, expected_voltage_rms_v: event.target.value }))} /></label>
                </div>

                <button className="ai-analyze-button" disabled={busy || !status?.has_capture || !status?.ai_configured} onClick={analyze}>
                    {busy ? 'Thinking…' : 'Analyze current capture'}
                </button>
                <label className="ai-monitor-toggle">
                    <input
                        type="checkbox"
                        checked={Boolean(status?.monitor_enabled)}
                        disabled={monitorBusy || !status?.ai_configured}
                        onChange={(event) => toggleMonitor(event.target.checked)}
                    />
                    <span>Monitor and explain anomalies automatically</span>
                </label>
                <small className="ai-monitor-note">Automatic analysis sends a capture to the configured AI service when a candidate persists.</small>

                {latestInsight && <div className="ai-latest-insight" aria-live="polite">
                    <strong>Latest analysis</strong>
                    <p>{latestInsight.summary}</p>
                    {latestInsight.findings?.map((finding, index) => (
                        <article className={`ai-finding severity-${finding.severity}`} key={`${finding.title}-${index}`}>
                            <b>{finding.title}</b>
                            {finding.channels?.length > 0 && <span className="ai-finding-channels">{finding.channels.join(', ')}</span>}
                            <p>{finding.interpretation}</p>
                            {finding.evidence?.length > 0 && <small>Evidence: {finding.evidence.join(' · ')}</small>}
                            {finding.next_steps?.length > 0 && <small>Next: {finding.next_steps.join(' · ')}</small>}
                        </article>
                    ))}
                </div>}

                <div className="ai-chat-log" aria-live="polite" aria-label="AI conversation">
                    {messages.length === 0 && <p className="ai-chat-placeholder">Ask about the current waveform or an AI finding.</p>}
                    {messages.map((item, index) => (
                        <div className={`ai-chat-message ${item.role}`} key={`${item.role}-${index}`}>
                            <strong>{item.role === 'user' ? 'You' : 'Assistant'}</strong>
                            <p>{item.content}</p>
                        </div>
                    ))}
                    {busy && messages.at(-1)?.role === 'user' && <div className="ai-chat-message assistant"><strong>Assistant</strong><p>Analyzing the current capture…</p></div>}
                    <div ref={chatEndRef} />
                </div>
                <form className="ai-chat-form" onSubmit={sendMessage}>
                    <textarea rows="2" maxLength="2000" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question…" />
                    <button type="submit" disabled={busy || !question.trim() || !status?.ai_configured || !status?.has_capture}>Send</button>
                </form>
                {error && <p className="ai-error" role="alert">{error}</p>}
                {status && !status.ai_configured && <p className="ai-config-note">Set GEMINI_API_KEY in ai_service/.env to enable chat and analysis.</p>}
            </div>
        </details>
    );
}

function parseOptionalNumber(value) {
    if (value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}
