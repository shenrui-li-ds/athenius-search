'use client';

import React from 'react';
import SearchResult from './SearchResult';

interface ThreadMessageProps {
  query: string;
  refinedQuery?: string | null;
  searchIntent?: string | null;
  content: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    iconUrl: string;
    snippet?: string;
    sourceType?: 'web' | 'academic';
    doi?: string;
    citedByCount?: number;
    journalName?: string;
    publicationYear?: number;
  }>;
  images?: Array<{
    url: string;
    alt: string;
    sourceId: string;
  }>;
  provider?: string;
  isLatest?: boolean; // Whether this is the most recent message (shows streaming state)
  isStreaming?: boolean;
  loadingStage?: string;
  sequenceNum: number;
}

const ThreadMessage: React.FC<ThreadMessageProps> = ({
  query,
  refinedQuery,
  searchIntent,
  content,
  sources,
  images,
  provider = 'deepseek',
  isLatest = false,
  isStreaming = false,
  loadingStage = 'complete',
  sequenceNum,
}) => {
  return (
    <div className="thread-message mb-6">
      {/* User Query Bubble */}
      <div className="flex justify-start mb-3">
        <div className="max-w-full md:max-w-[85%] px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-2xl rounded-bl-md">
          <p className="text-[var(--text-primary)] text-sm md:text-base">{query}</p>
        </div>
      </div>

      {/* Response Card - uses compact SearchResult */}
      <div className="ml-0">
        <SearchResult
          query={query}
          result={{
            content: content,
            sources: sources,
            images: images,
          }}
          provider={provider}
          mode="web"
          compact={true}
          searchIntent={isLatest ? searchIntent : null}
          refinedQuery={isLatest ? refinedQuery : null}
          isStreaming={isLatest ? isStreaming : false}
          loadingStage={isLatest ? (loadingStage as any) : 'complete'}
          streamCompleted={!isStreaming && loadingStage === 'complete'}
        />
      </div>
    </div>
  );
};

export default ThreadMessage;
