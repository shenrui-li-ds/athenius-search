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
    sourceId?: string;
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
  // Suppress unused var
  void sequenceNum;

  return (
    <div className="thread-message">
      {/* User Query — right-aligned pill */}
      <div className="pt-6 pb-1 flex justify-end px-6">
        <div className="inline-block px-4 py-2.5 rounded-2xl thread-query-bubble max-w-[85%]">
          <p className="text-[15px] font-medium leading-relaxed">{query}</p>
        </div>
      </div>

      {/* Response — compact SearchResult */}
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
        loadingStage={isLatest ? (loadingStage as 'refining' | 'searching' | 'summarizing' | 'complete') : 'complete'}
        streamCompleted={!isStreaming && loadingStage === 'complete'}
      />
    </div>
  );
};

export default ThreadMessage;
