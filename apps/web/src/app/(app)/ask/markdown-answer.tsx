"use client";

import Link from "next/link";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { meetingPath, type Citation } from "@stancehub/shared";

/**
 * Normalize common LLM quirks before GFM parse.
 * Do not enable raw HTML rendering — model output is untrusted.
 */
export function normalizeAskMarkdown(source: string): string {
  return source
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/\r\n/g, "\n");
}

/** Turn `[n]` markers into markdown links `[[n]](citation:n)` for hover + jump. */
export function linkifyCitationMarkers(source: string): string {
  return source.replace(/\[(\d+)\]/g, (_match, digits: string) => `[\\[${digits}\\]](citation:${digits})`);
}

function citationUrlTransform(url: string) {
  if (url.startsWith("citation:")) return url;
  return defaultUrlTransform(url);
}

type MarkdownAnswerProps = {
  source: string;
  citations: Citation[];
};

export function MarkdownAnswer({ source, citations }: MarkdownAnswerProps) {
  const byN = new Map(citations.map((citation) => [citation.n, citation]));
  const markdown = linkifyCitationMarkers(normalizeAskMarkdown(source));

  const markdownComponents = {
    table: ({ children }: { children?: React.ReactNode }) => (
      <div style={{ overflowX: "auto", margin: "12px 0" }}>
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            fontSize: "0.95rem",
          }}
        >
          {children}
        </table>
      </div>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th
        style={{
          border: "1px solid #ccc",
          padding: "6px 8px",
          textAlign: "left",
          background: "#f5f5f5",
          verticalAlign: "top",
        }}
      >
        {children}
      </th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td
        style={{
          border: "1px solid #ccc",
          padding: "6px 8px",
          verticalAlign: "top",
          whiteSpace: "pre-wrap",
        }}
      >
        {children}
      </td>
    ),
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      if (href?.startsWith("citation:")) {
        const n = Number(href.slice("citation:".length));
        const citation = Number.isFinite(n) ? byN.get(n) : undefined;
        const preview = citation
          ? `[${n}] ${citation.meetingTitle ?? "Meeting"}: ${citation.quote}`
          : `[${n}] (excerpt not in citation list)`;
        if (!citation) {
          return (
            <sup title={preview} style={{ cursor: "help", color: "#666" }}>
              {children}
            </sup>
          );
        }
        return (
          <Link
            href={meetingPath(citation.meetingId, { tMs: citation.startMs })}
            title={preview}
            id={`answer-cite-${n}`}
            style={{ textDecoration: "none", color: "#0b57d0", fontWeight: 600 }}
            onClick={(event) => {
              const target = document.getElementById(`cite-${n}`);
              if (target) {
                event.preventDefault();
                target.scrollIntoView({ block: "nearest", behavior: "smooth" });
                target.focus({ preventScroll: true });
              }
            }}
          >
            <sup>{children}</sup>
          </Link>
        );
      }
      return (
        <a href={href} rel="noreferrer noopener">
          {children}
        </a>
      );
    },
    p: ({ children }: { children?: React.ReactNode }) => (
      <p style={{ margin: "0.6em 0" }}>{children}</p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul style={{ margin: "0.6em 0", paddingLeft: "1.25em" }}>{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol style={{ margin: "0.6em 0", paddingLeft: "1.25em" }}>{children}</ol>
    ),
  };

  return (
    <div className="ask-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={citationUrlTransform}
        components={markdownComponents}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
