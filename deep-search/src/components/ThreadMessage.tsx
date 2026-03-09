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
  isLatest?: boolean;
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
    <div className="thread-message">
      {/* User Query — right-aligned chat bubble */}
      <div className="pt-10 first:pt-4 pb-2 flex justify-end">
        <div className="inline-block px-4 py-2 rounded-2xl thread-query-bubble">
          <p className="text-sm md:text-base font-medium">{query}</p>
        </div>
      </div>

      {/* Response — uses compact SearchResult, no wrapper chrome */}
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
  );
};

export default ThreadMessage;
