import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

export default function LanguageSelector() {
    const { t, i18n } = useTranslation();

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    // Safely handle language codes like 'en-US' by taking the first part
    const currentLang = (i18n.language || 'en').split('-')[0];

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <Globe size={16} color="var(--text-muted)" />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{t('dashboard.language')}:</span>
            <select
                value={currentLang}
                onChange={(e) => changeLanguage(e.target.value)}
                style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    cursor: 'pointer'
                }}
            >
                <option value="en" style={{ background: '#333', color: '#fff' }}>English</option>
                <option value="fr" style={{ background: '#333', color: '#fff' }}>Français</option>
            </select>
        </div>
    );
}
