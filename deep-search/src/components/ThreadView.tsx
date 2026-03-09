'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import ThreadMessageComponent from './ThreadMessage';
import { useTranslations } from 'next-intl';
import type { ThreadMessage } from '@/lib/supabase/database';

interface ThreadViewProps {
  threadId: string;
  title: string;
  messages: ThreadMessage[];
  messageCount: number;
  provider?: string;
  // Streaming state for the latest message
  isStreaming?: boolean;
  loadingStage?: string;
  streamingContent?: string;
  streamingSources?: any[];
  streamingImages?: any[];
  streamingSearchIntent?: string | null;
  streamingRefinedQuery?: string | null;
  // Follow-up handling
  onFollowUp: (query: string) => void;
  isFollowUpDisabled?: boolean;
}

const ThreadView: React.FC<ThreadViewProps> = ({
  threadId,
  title,
  messages,
  messageCount,
  provider = 'deepseek',
  isStreaming = false,
  loadingStage = 'complete',
  streamingContent = '',
  streamingSources = [],
  streamingImages = [],
  streamingSearchIntent = null,
  streamingRefinedQuery = null,
  onFollowUp,
  isFollowUpDisabled = false,
}) => {
  const t = useTranslations('search');
  const tCommon = useTranslations('common');
  const [followUpQuery, setFollowUpQuery] = useState('');
  const followUpTextareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const MAX_MESSAGES = 20;
  const isAtLimit = messageCount >= MAX_MESSAGES;

  // Auto-resize follow-up textarea
  const adjustFollowUpHeight = useCallback(() => {
    const textarea = followUpTextareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = 80;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    }
  }, []);

  useEffect(() => {
    adjustFollowUpHeight();
  }, [followUpQuery, adjustFollowUpHeight]);

  // Scroll to bottom when new messages arrive or streaming updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContent]);

  const handleFollowUp = () => {
    const trimmed = followUpQuery.trim();
    if (!trimmed || isAtLimit || isFollowUpDisabled) return;
    onFollowUp(trimmed);
    setFollowUpQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFollowUp();
    }
  };

  return (
    <div className="thread-view flex flex-col min-h-0">
      {/* Thread Header */}
      <div className="mb-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-xl md:text-2xl font-semibold text-[var(--text-primary)] line-clamp-2">{title}</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {messageCount} {messageCount === 1 ? 'message' : 'messages'}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2">
        {messages.map((msg, index) => (
          <ThreadMessageComponent
            key={msg.id}
            query={msg.query}
            refinedQuery={msg.refined_query}
            searchIntent={msg.search_intent}
            content={msg.content || ''}
            sources={(msg.sources || []) as any[]}
            images={(msg.images || []) as any[]}
            provider={msg.provider || provider}
            sequenceNum={msg.sequence_num}
            isLatest={false}
          />
        ))}

        {/* Currently streaming message */}
        {isStreaming && streamingContent !== undefined && (
          <ThreadMessageComponent
            query={followUpQuery || ''}
            refinedQuery={streamingRefinedQuery}
            searchIntent={streamingSearchIntent}
            content={streamingContent}
            sources={streamingSources}
            images={streamingImages}
            provider={provider}
            sequenceNum={messageCount + 1}
            isLatest={true}
            isStreaming={true}
            loadingStage={loadingStage}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Thread Limit Banner */}
      {isAtLimit && (
        <div className="my-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
          <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
            This thread has reached the {MAX_MESSAGES}-message limit.
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Start a new search to continue exploring this topic.
          </p>
        </div>
      )}

      {/* Spacer for floating follow-up */}
      <div className="h-24" />

      {/* Gradient fade above follow-up input */}
      <div className="fixed bottom-[52px] left-0 right-0 h-12 bg-gradient-to-t from-[var(--background)] to-transparent pointer-events-none z-30 md:ml-[72px] print:hidden" />

      {/* Fixed Follow-up Input */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--background)] border-t border-[var(--border)] py-2 px-3 md:pl-[calc(72px+12px)] print:hidden">
        <div className="flex items-center gap-2 py-2 px-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-4xl mx-auto">
          {/* Web mode indicator (fixed, not selectable) */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--background)] rounded-lg text-[var(--text-muted)] flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-xs font-medium hidden md:inline">{t('modes.web')}</span>
          </div>

          <textarea
            ref={followUpTextareaRef}
            rows={1}
            placeholder={isAtLimit ? 'Thread limit reached' : t('followUp')}
            value={followUpQuery}
            onChange={(e) => setFollowUpQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAtLimit || isFollowUpDisabled}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none text-sm resize-none overflow-y-auto scrollbar-thin min-h-[20px] disabled:opacity-50"
          />
          <Button
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={handleFollowUp}
            disabled={!followUpQuery.trim() || isAtLimit || isFollowUpDisabled}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Button>
        </div>
        {/* Safe area padding for iOS */}
        <div className="h-[env(safe-area-inset-bottom)] md:hidden" />
      </div>
    </div>
  );
};

export default ThreadView;
