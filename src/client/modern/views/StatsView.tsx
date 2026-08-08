import {
    Activity,
    CalendarDays,
    Flame,
    Image as ImageIcon,
    MessageCircle,
    TrendingUp,
    Users
} from 'lucide-react';
import { Avatar } from '../components/character-visuals.js';
import { buildStatsInsights } from '../stats.js';
import type { ModernController } from '../useModernController.js';

export function StatsView({ controller }: { controller: ModernController }) {
    const messages = controller.data.characters.flatMap((character) => character.messages || []);
    const userMessages = messages.filter((message) => message.role === 'user').length;
    const assistantMessages = messages.filter((message) => message.role === 'assistant').length;
    const mediaUrls = new Set(
        [
            ...controller.data.galleryImages.map((item) => item.imageUrl || item.videoUrl),
            ...controller.generatorAssets.map((item) => item.url)
        ].filter(Boolean)
    );
    const activeCharacters = controller.data.characters.filter(
        (character) => character.messages.length > 0
    ).length;
    const insights = buildStatsInsights(controller.data.statistics);
    const rankedCharacters = controller.data.characters
        .slice()
        .sort((a, b) => b.messages.length - a.messages.length)
        .slice(0, 5);
    const maxCharacterMessages = Math.max(
        1,
        ...rankedCharacters.map((item) => item.messages.length)
    );
    const activityMax = Math.max(1, ...insights.activity.map((day) => day.total));
    const lastUpdated = insights.lastUpdatedAt
        ? new Date(insights.lastUpdatedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short'
          })
        : null;
    const cards = [
        {
            label: 'Total messages',
            value: userMessages + assistantMessages,
            detail: `${userMessages.toLocaleString()} sent · ${assistantMessages.toLocaleString()} replies`,
            icon: MessageCircle
        },
        {
            label: 'Media created',
            value: mediaUrls.size,
            detail: `${controller.data.galleryImages.length.toLocaleString()} gallery items`,
            icon: ImageIcon
        },
        {
            label: 'Active days',
            value: insights.activeDays,
            detail: `${insights.currentStreak.toLocaleString()} day current streak`,
            icon: Flame
        },
        {
            label: 'Characters',
            value: controller.data.characters.length,
            detail: `${activeCharacters.toLocaleString()} with conversations`,
            icon: Users
        }
    ];
    return (
        <div className="m-page">
            <section className="m-page-hero">
                <div>
                    <span className="m-eyebrow">Personal insights</span>
                    <h2>Your creative rhythm.</h2>
                    <p>
                        Statistics stay in this browser profile and update as you use chat and
                        generation.
                    </p>
                    <div className="m-stats-meta">
                        <CalendarDays size={14} />
                        {lastUpdated
                            ? `Last activity recorded ${lastUpdated}`
                            : 'No tracked activity yet'}
                    </div>
                </div>
            </section>
            <section className="m-stat-grid">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <article key={card.label}>
                            <span>
                                <Icon size={20} />
                            </span>
                            <strong>{card.value.toLocaleString()}</strong>
                            <small>{card.label}</small>
                            <em>{card.detail}</em>
                        </article>
                    );
                })}
            </section>
            <section className="m-insight-grid">
                <article className="m-insight-panel wide">
                    <header>
                        <div>
                            <span className="m-eyebrow">Recent activity</span>
                            <h3>Last 14 days</h3>
                        </div>
                        {insights.busiestDay && (
                            <div className="m-panel-summary">
                                <TrendingUp size={16} />
                                <span>
                                    Busiest: <strong>{insights.busiestDay.label}</strong> ·{' '}
                                    {insights.busiestDay.total.toLocaleString()} activities
                                </span>
                            </div>
                        )}
                    </header>
                    {insights.activity.some((day) => day.total > 0) ? (
                        <>
                            <div className="m-chart-legend" aria-label="Activity chart legend">
                                <span className="messages">Messages</span>
                                <span className="media">Media</span>
                            </div>
                            <div className="m-activity-chart">
                                {insights.activity.map((day) => (
                                    <div key={day.date}>
                                        <div
                                            className="m-activity-bar"
                                            role="img"
                                            aria-label={`${day.label}: ${day.messages} messages and ${day.media} media`}
                                            title={`${day.label}: ${day.messages} messages, ${day.media} media`}
                                            style={{
                                                height: `${Math.max(day.total ? 8 : 2, (day.total / activityMax) * 100)}%`
                                            }}
                                        >
                                            {day.messages > 0 && (
                                                <span
                                                    className="messages"
                                                    style={{ flex: day.messages }}
                                                />
                                            )}
                                            {day.media > 0 && (
                                                <span
                                                    className="media"
                                                    style={{ flex: day.media }}
                                                />
                                            )}
                                        </div>
                                        <small>{day.label}</small>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="m-empty-inline">
                            <Activity size={22} /> Activity appears after you chat or generate
                            media.
                        </div>
                    )}
                </article>
                <article className="m-insight-panel">
                    <header>
                        <span className="m-eyebrow">Characters</span>
                        <h3>Conversation split</h3>
                    </header>
                    <div className="m-ranking">
                        {rankedCharacters.map((character) => (
                            <div key={character.id}>
                                <Avatar
                                    character={character}
                                    galleryImages={controller.data.galleryImages}
                                    size="small"
                                />
                                <span>
                                    <strong>{character.name}</strong>
                                    <small>
                                        {character.messages.length.toLocaleString()} messages ·{' '}
                                        {messages.length
                                            ? Math.round(
                                                  (character.messages.length / messages.length) *
                                                      100
                                              )
                                            : 0}
                                        % of total
                                    </small>
                                </span>
                                <i
                                    style={{
                                        width: `${(character.messages.length / maxCharacterMessages) * 100}%`
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </article>
                <article className="m-insight-panel">
                    <header>
                        <span className="m-eyebrow">Models</span>
                        <h3>Most used</h3>
                    </header>
                    <div className="m-ranking">
                        {insights.topModels.length ? (
                            insights.topModels.map((model) => (
                                <div key={model.key}>
                                    <span>
                                        <strong title={model.label}>{model.label}</strong>
                                        <small>{model.detail}</small>
                                    </span>
                                    <b>{model.count.toLocaleString()}</b>
                                </div>
                            ))
                        ) : (
                            <div className="m-empty-inline">
                                Model usage appears after a reply or generation.
                            </div>
                        )}
                    </div>
                </article>
                <article className="m-insight-panel">
                    <header>
                        <span className="m-eyebrow">Prompts</span>
                        <h3>Most reused</h3>
                    </header>
                    <div className="m-ranking m-ranking--text">
                        {insights.topPrompts.length ? (
                            insights.topPrompts.map((prompt) => (
                                <div key={prompt.key}>
                                    <span>
                                        <strong title={prompt.label}>{prompt.label}</strong>
                                        <small>{prompt.detail}</small>
                                    </span>
                                    <b>{prompt.count.toLocaleString()}</b>
                                </div>
                            ))
                        ) : (
                            <div className="m-empty-inline">
                                Frequently used prompts appear here.
                            </div>
                        )}
                    </div>
                </article>
                <article className="m-insight-panel">
                    <header>
                        <span className="m-eyebrow">Workspace</span>
                        <h3>Most visited</h3>
                    </header>
                    <div className="m-ranking">
                        {insights.topViews.length ? (
                            insights.topViews.map((view) => (
                                <div key={view.key}>
                                    <span>
                                        <strong>{view.label}</strong>
                                        <small>{view.detail}</small>
                                    </span>
                                    <b>{view.count.toLocaleString()}</b>
                                </div>
                            ))
                        ) : (
                            <div className="m-empty-inline">Page visits appear as you explore.</div>
                        )}
                    </div>
                </article>
            </section>
        </div>
    );
}
