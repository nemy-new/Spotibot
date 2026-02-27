import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '../index.css';

export function TutorialOverlay({ onClose }) {
    const { t } = useTranslation();
    const [step, setStep] = useState(0);

    const totalSteps = 4;

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, []);

    const handleNext = () => {
        if (step < totalSteps - 1) {
            setStep(step + 1);
        } else {
            onClose();
        }
    };

    const handleBack = () => {
        if (step > 0) {
            setStep(step - 1);
        }
    };

    // Common Styles
    const cardStyle = {
        width: '480px',
        maxWidth: '90%',
        height: '600px',
        padding: '48px 40px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(18, 18, 18, 0.85)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderRadius: '32px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
        position: 'relative',
        overflow: 'hidden'
    };

    const titleStyle = {
        fontSize: '28px',
        fontWeight: '800',
        marginBottom: '16px',
        letterSpacing: '-0.02em',
        background: 'linear-gradient(180deg, #FFFFFF 0%, #A0A0A0 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        textAlign: 'center'
    };

    const descStyle = {
        fontSize: '15px',
        lineHeight: '1.6',
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        fontWeight: '400',
        maxWidth: '320px',
        margin: '0 auto'
    };

    const stepsContent = [
        // Step 0: Welcome
        (
            <div className="step-content" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                    width: '140px', height: '140px', borderRadius: '50%',
                    background: 'radial-gradient(circle at 50% 50%, rgba(29, 185, 84, 0.2) 0%, rgba(0,0,0,0) 70%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '24px', position: 'relative'
                }}>
                    <div style={{ fontSize: '64px', filter: 'drop-shadow(0 0 20px rgba(29, 185, 84, 0.4))' }}>👋</div>
                    <div className="pulse-ring"></div>
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <h2 style={titleStyle}>{t('tutorial.welcome.title')}</h2>
                    <p style={descStyle}>{t('tutorial.welcome.description')}</p>
                </div>
            </div>
        ),
        // Step 1: SwitchBot
        (
            <div className="step-content" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                    width: '120px', height: '120px', borderRadius: '32px',
                    background: 'linear-gradient(135deg, rgba(255, 107, 107, 0.15) 0%, rgba(0,0,0,0) 100%)',
                    border: '1px solid rgba(255, 107, 107, 0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '32px', boxShadow: '0 8px 32px rgba(255, 107, 107, 0.1)'
                }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '56px', color: '#ff6b6b' }}>lightbulb</span>
                </div>

                <h2 style={titleStyle}>{t('tutorial.switchbot.title')}</h2>
                <p style={{ ...descStyle, marginBottom: '24px' }}>{t('tutorial.switchbot.description')}</p>

                <div style={{
                    background: 'rgba(255,255,255,0.03)', padding: '20px 24px', borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.06)', width: '100%', boxSizing: 'border-box'
                }}>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '12px', fontWeight: '500', textAlign: 'center' }}>
                        {t('tutorial.switchbot.note')}
                    </div>
                    <a href="https://github.com/OpenWonderLabs/SwitchBotAPI#getting-started" target="_blank"
                        className="glass-button"
                        style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
                        {t('tutorial.switchbot.link')} <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
                    </a>
                </div>
            </div>
        ),
        // Step 2: Spotify
        (
            <div className="step-content" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                    width: '120px', height: '120px', borderRadius: '32px',
                    background: 'linear-gradient(135deg, rgba(29, 185, 84, 0.15) 0%, rgba(0,0,0,0) 100%)',
                    border: '1px solid rgba(29, 185, 84, 0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '32px', boxShadow: '0 8px 32px rgba(29, 185, 84, 0.1)'
                }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '56px', color: '#1DB954' }}>music_note</span>
                </div>

                <h2 style={titleStyle}>{t('tutorial.spotify.title')}</h2>
                <p style={{ ...descStyle, marginBottom: '24px' }}>{t('tutorial.spotify.description')}</p>

                <div style={{
                    background: 'rgba(255,255,255,0.03)', padding: '20px 24px', borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.06)', width: '100%', boxSizing: 'border-box'
                }}>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '12px', fontWeight: '500', textAlign: 'center' }}>
                        {t('tutorial.spotify.note')}
                    </div>
                    <a href="https://developer.spotify.com/dashboard" target="_blank"
                        className="glass-button"
                        style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', background: 'rgba(29, 185, 84, 0.1)', color: '#1DB954', border: '1px solid rgba(29, 185, 84, 0.2)' }}>
                        {t('tutorial.spotify.link')} <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
                    </a>
                </div>
            </div>
        ),
        // Step 3: Ready
        (
            <div className="step-content" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ position: 'relative', marginBottom: '24px' }}>
                    <div style={{
                        width: '140px', height: '140px', borderRadius: '50%',
                        background: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.1) 0%, rgba(0,0,0,0) 70%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',

                    }}>
                        <div style={{ fontSize: '64px' }}>✨</div>
                    </div>

                    {/* CSS Confetti */}
                    <div className="confetti-container">
                        {[...Array(20)].map((_, i) => (
                            <div key={i} className="confetti" style={{
                                '--delay': `${i * 0.1}s`,
                                '--x': `${Math.random() * 200 - 100}px`,
                                '--y': `${Math.random() * 200 - 100}px`,
                                '--color': ['#ff6b6b', '#1DB954', '#4ecdc4', '#ffe66d'][i % 4]
                            }} />
                        ))}
                    </div>
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <h2 style={titleStyle}>{t('tutorial.ready.title')}</h2>
                    <p style={descStyle}>{t('tutorial.ready.description')}</p>
                </div>
            </div>
        )
    ];

    return (
        <div className="modal-overlay animate-in" style={{
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            transition: 'all 0.4s ease'
        }}>
            <style>
                {`
                .glass-button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px 20px;
                    border-radius: 12px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: white;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    box-sizing: border-box;
                    transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
                }
                .glass-button:hover {
                    background: rgba(255, 255, 255, 0.12);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                }
                .glass-button:active {
                    transform: translateY(0);
                }
                
                .primary-button {
                    background: #1DB954;
                    border: none;
                    color: black;
                    box-shadow: 0 4px 24px rgba(29, 185, 84, 0.3);
                }
                .primary-button:hover {
                    background: #1ed760;
                    box-shadow: 0 6px 32px rgba(29, 185, 84, 0.4);
                }

                .nav-dot {
                    width: 6px; height: 6px;
                    border-radius: 3px;
                    background: rgba(255, 255, 255, 0.2);
                    transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
                }
                .nav-dot.active {
                    width: 24px;
                    background: white;
                }

                .icon-bounce { animation: icon-bounce 2s infinite ease-in-out; }
                @keyframes icon-bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-8px); }
                }

                .pulse-ring {
                    position: absolute;
                    width: 100%; height: 100%;
                    border-radius: 50%;
                    border: 2px solid rgba(29, 185, 84, 0.5);
                    animation: pulse-ring 2s infinite;
                }
                @keyframes pulse-ring {
                    0% { transform: scale(0.8); opacity: 1; }
                    100% { transform: scale(1.5); opacity: 0; }
                }

                .confetti {
                    position: absolute;
                    top: 50%; left: 50%;
                    width: 8px; height: 8px;
                    background: var(--color);
                    border-radius: 50%;
                    pointer-events: none;
                    opacity: 0;
                    animation: pop 1s ease-out forwards;
                    animation-delay: var(--delay);
                }
                @keyframes pop {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
                    100% { transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(1); opacity: 0; }
                }
                `}
            </style>

            <div style={cardStyle}>
                {/* Header Actions */}
                <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', height: '20px' }}>
                    {step < totalSteps - 1 && (
                        <button onClick={onClose} style={{
                            background: 'transparent', border: 'none',
                            color: 'rgba(255,255,255,0.4)', fontSize: '13px', fontWeight: '500',
                            cursor: 'pointer', transition: 'color 0.2s'
                        }} className="hover:text-white">
                            {t('tutorial.skip')}
                        </button>
                    )}
                </div>

                {/* Main Content (Horizontal Slider) */}
                <div style={{ flex: 1, width: '100%', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <div style={{
                        display: 'flex',
                        width: '100%',
                        transform: `translateX(-${step * 100}%)`,
                        transition: 'transform 0.6s cubic-bezier(0.2, 1, 0.3, 1)'
                    }}>
                        {stepsContent.map((content, index) => (
                            <div key={index} style={{
                                minWidth: '100%', width: '100%',
                                flexShrink: 0,
                                display: 'flex', justifyContent: 'center', alignItems: 'center',
                                padding: '0 12px', boxSizing: 'border-box'
                            }}>
                                {content}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Controls */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '32px', alignItems: 'center', marginTop: 'auto' }}>
                    {/* Pagination */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {[...Array(totalSteps)].map((_, i) => (
                            <div key={i} className={`nav-dot ${i === step ? 'active' : ''}`}
                                onClick={() => i < step ? setStep(i) : null}
                                style={{ cursor: i < step ? 'pointer' : 'default' }} />
                        ))}
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', width: '100%', gap: '12px' }}>
                        {step > 0 && (
                            <button onClick={handleBack} className="glass-button" style={{ width: '56px', justifyContent: 'center', padding: '0' }}>
                                <span className="material-symbols-outlined">arrow_back</span>
                            </button>
                        )}

                        <button
                            onClick={handleNext}
                            className={`glass-button ${step === totalSteps - 1 ? 'primary-button' : ''}`}
                            style={{ flex: 1, justifyContent: 'center' }}
                        >
                            {step === totalSteps - 1 ? (
                                <>
                                    {t('tutorial.ready.button')}
                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>rocket_launch</span>
                                </>
                            ) : (
                                <>
                                    {t('tutorial.next')}
                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Decorative Background Blur inside card */}
                <div style={{
                    position: 'absolute', top: '0%', left: '0%', width: '100%', height: '50%',
                    background: 'radial-gradient(ellipse at top, rgba(255,255,255,0.03), transparent 70%)',
                    pointerEvents: 'none', zIndex: -1
                }} />
            </div>
        </div>
    );
}
