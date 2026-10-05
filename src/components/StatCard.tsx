"use client";

import React from "react";
import { MetricCardData } from "@/types/dashboard";

interface StatCardProps {
  card: MetricCardData;
}

export function StatCard({ card }: StatCardProps) {
  const renderIcon = () => {
    switch (card.iconName) {
      case "courses":
        return (
          <svg className="w-6 h-6 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        );
      case "students":
        return (
          <svg className="w-6 h-6 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      case "teachers":
        return (
          <svg className="w-6 h-6 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case "period":
        return (
          <svg className="w-6 h-6 text-blue-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {card.title}
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {card.value}
            </span>
            {card.badge && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                  card.badge.variant === "success"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : card.badge.variant === "info"
                    ? "bg-blue-100 text-blue-800 border border-blue-300"
                    : "bg-slate-100 text-slate-850"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                {card.badge.text}
              </span>
            )}
          </div>
        </div>

        <div className="w-11 h-11 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          {renderIcon()}
        </div>
      </div>

      {card.subtitle && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-xs text-slate-500">
          <span>{card.subtitle}</span>
        </div>
      )}
    </div>
  );
}
