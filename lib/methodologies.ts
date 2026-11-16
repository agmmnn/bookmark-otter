export interface MethodologyPreset {
  id: string;
  icon: string;
  shortName: {
    tr: string;
    en: string;
  };
  name: {
    tr: string;
    en: string;
  };
  tagline: {
    tr: string;
    en: string;
  };
  badge: {
    tr: string;
    en: string;
  };
  bestFor: {
    tr: string;
    en: string;
  };
  structure: string[];
  treePreview: {
    tr: string[];
    en: string[];
  };
  prompt: {
    tr: string;
    en: string;
  };
}

export const CUSTOM_METHODOLOGY_ID = 'custom';

export function buildCustomMethodologyPrompt(
  folders: string[],
  lang: 'tr' | 'en'
): { name: string; prompt: string } {
  const cleaned = folders.map((f) => f.trim()).filter(Boolean);
  const folderList = cleaned.join(', ');
  return {
    name: lang === 'tr' ? 'Özel Şablon' : 'Custom',
    prompt:
      lang === 'tr'
        ? `Yer imlerimi şu özel klasör şablonuna göre düzenle: ${folderList}. Maksimum 2 seviye derinliği koru ve günlük çubuk kısayollarına dokunma.`
        : `Reorganize my library using this custom folder template: ${folderList}. Maintain at most 2 levels of hierarchy and keep daily bar launchpins.`,
  };
}

export const METHODOLOGY_PRESETS: MethodologyPreset[] = [
  {
    id: 'para',
    icon: '🎯',
    shortName: {
      tr: 'PARA',
      en: 'PARA Method',
    },
    name: {
      tr: 'PARA Metodu',
      en: 'PARA Method',
    },
    tagline: {
      tr: 'Eylem ve zaman odaklı 4 temel alan',
      en: 'Action & timeline oriented 4 containers',
    },
    badge: {
      tr: 'Projects • Areas • Resources • Archives',
      en: 'Projects • Areas • Resources • Archives',
    },
    bestFor: {
      tr: 'Aktif proje geliştirenler, indie hackerlar ve geliştiriciler',
      en: 'Makers, indie hackers, and active developers',
    },
    structure: ['1_Projects', '2_Areas', '3_Resources', '4_Archives'],
    treePreview: {
      tr: [
        '1_Projects / SaaS Lansman, Müşteri X',
        '2_Areas / Finans, Sağlık, Araçlar',
        '3_Resources / Tasarım, Geliştirme, Yapay Zeka',
        '4_Archives / Eski Referanslar',
      ],
      en: [
        '1_Projects / SaaS Launch, Client Work',
        '2_Areas / Finance, Health, Core Tools',
        '3_Resources / Design, Engineering, AI',
        '4_Archives / Completed & Cold Refs',
      ],
    },
    prompt: {
      tr: 'Yer imlerimi PARA metoduna göre düzenle: 1_Projects (aktif zaman kısıtlı projeler), 2_Areas (sürekli sorumluluklar), 3_Resources (konu/doküman kütüphanesi) ve 4_Archives (tamamlananlar). Yer İmleri Çubuğundaki günlük favicon pinlerini koru.',
      en: 'Reorganize my library strictly using the PARA method: 1_Projects (active finite projects), 2_Areas (ongoing responsibilities), 3_Resources (topics & docs), and 4_Archives (completed/inactive). Preserve daily launchpins on Bookmarks Bar.',
    },
  },
  {
    id: 'frequency',
    icon: '🔥',
    shortName: {
      tr: 'Hot-Warm-Cold',
      en: 'Hot-Warm-Cold',
    },
    name: {
      tr: 'Hot-Warm-Cold (Frekans)',
      en: 'Hot-Warm-Cold (Frequency)',
    },
    tagline: {
      tr: 'Erişim hızına ve tıklama sıklığına göre katmanlar',
      en: 'Layered by access velocity & visit frequency',
    },
    badge: {
      tr: 'Günlük • Haftalık • Aylık • Arşiv',
      en: 'Daily • Weekly • Monthly • Cold',
    },
    bestFor: {
      tr: 'Hız ve kas hafızasını her şeyin önünde tutan pratik kullanıcılar',
      en: 'Speed and muscle-memory focused power users',
    },
    structure: ['🔥 Daily (Bar)', '⚡ Weekly Tools', '📅 Monthly Ref', '🧊 Cold Storage'],
    treePreview: {
      tr: [
        '🔥 Daily (Çubuk Pinleri) / Gmail, GitHub, Figma',
        '⚡ Weekly Tools / Analitik, Dağıtım, AI Araçları',
        '📅 Monthly Reference / Faturalama, Resmi İşler',
        '🧊 Cold Storage / Nadir Bakılan Okumalar',
      ],
      en: [
        '🔥 Daily (Bar Pins) / Mail, GitHub, Figma',
        '⚡ Weekly Tools / Analytics, Deploy, AI',
        '📅 Monthly Reference / Billing, Admin Panels',
        '🧊 Cold Storage / Deep Archives',
      ],
    },
    prompt: {
      tr: 'Yer imlerimi kullanım frekansına göre katmanlara ayır: Yer İmleri Çubuğunda günlük araçları sadece favicon olarak koru, ⚡ Weekly (sık kullanılan web araçları), 📅 Monthly (paneller, fatura, referans) ve 🧊 Cold Storage (nadir bakılan arşivler) olarak sınıflandır.',
      en: 'Organize bookmarks by access velocity: Keep daily tools as icon-only launchpins on the left of Bookmarks Bar, ⚡ Weekly (frequent tools), 📅 Monthly (infrequent/admin/billing), and 🧊 Cold Storage (rare references).',
    },
  },
  {
    id: 'johnny',
    icon: '🔟',
    shortName: {
      tr: 'Johnny.Decimal',
      en: 'Johnny.Decimal',
    },
    name: {
      tr: 'Johnny.Decimal (Numaralı)',
      en: 'Johnny.Decimal (Numbered)',
    },
    tagline: {
      tr: 'Maksimum 2 seviyeli kesin mühendislik sistemi',
      en: 'Strict 2-level numbered engineering index',
    },
    badge: {
      tr: '10-19 • 20-29 • 30-39',
      en: '10-19 • 20-29 • 30-39',
    },
    bestFor: {
      tr: 'Kaostan nefret eden ve her şeyin net indeksi olmasını isteyenler',
      en: 'Engineers who want a definitive address for everything',
    },
    structure: ['10-19 Development', '20-29 Design & UI', '30-39 Life & Finance', '40-49 Archives'],
    treePreview: {
      tr: [
        '10-19 Geliştirme / 11 Frontend, 12 Backend',
        '20-29 Tasarım & UI / 21 Renkler, 22 İkonlar',
        '30-39 Yaşam & Finans / 31 Banka, 32 Seyahat',
      ],
      en: [
        '10-19 Development / 11 Frontend, 12 Backend',
        '20-29 Design & UI / 21 Tokens, 22 Icons',
        '30-39 Life & Finance / 31 Banking, 32 Travel',
      ],
    },
    prompt: {
      tr: 'Johnny.Decimal sistemine göre düzenle: 5-8 ana alan (10-19 Geliştirme, 20-29 Tasarım, 30-39 Yaşam & Finans vb.). Asla 2 seviyeden fazla derinlik oluşturma, düzenli ve sayısal bir taksonomi kur.',
      en: 'Organize using the Johnny.Decimal system: 5-8 primary areas numbered 10-19, 20-29, 30-39 etc., with a strict 2-level depth limit for clean engineering structure.',
    },
  },
  {
    id: 'verb',
    icon: '⚡',
    shortName: {
      tr: 'Fiil Odaklı',
      en: 'Verb-Based',
    },
    name: {
      tr: 'Fiil / Aksiyon Odaklı',
      en: 'Verb-Based (Action)',
    },
    tagline: {
      tr: 'İsimler yerine fiillerle eyleme dönüştürme',
      en: 'Action verbs instead of passive nouns',
    },
    badge: {
      tr: 'Üret • Oku • Öğren • Satın Al',
      en: 'Build • Read • Learn • Buy',
    },
    bestFor: {
      tr: 'Tüketim ile üretimi birbirinden ayırmak isteyenler',
      en: 'Users wanting clear boundaries between consuming & building',
    },
    structure: ['🛠️ Build', '📖 Read', '🎓 Learn', '🛒 Buy'],
    treePreview: {
      tr: [
        '🛠️ Üret / API Dokümanları, Geliştirici Araçları',
        '📖 Oku / Bloglar, Makaleler, Bültenler',
        '🎓 Öğren / Kurslar, Rehberler',
      ],
      en: [
        '🛠️ Build / DevTools, Sandboxes, APIs',
        '📖 Read / Essays, Research, Newsletters',
        '🎓 Learn / Courses, Tutorials, Docs',
      ],
    },
    prompt: {
      tr: 'Klasörlerimi fiil odaklı (verb-based) eylemlere göre düzenle: 🛠️ Üret (araçlar, kod, sandbox), 📖 Oku (makaleler, dokümantasyon), 🎓 Öğren (kurslar, rehberler), 🛒 Satın Al (istek listesi, ürünler).',
      en: 'Organize into verb-based action containers: 🛠️ Build (dev tools & utilities), 📖 Read (articles & docs), 🎓 Learn (courses & guides), 🛒 Buy (wishlist & products).',
    },
  },
  {
    id: 'persona',
    icon: '💼',
    shortName: {
      tr: 'Rol & Persona',
      en: 'Role & Persona',
    },
    name: {
      tr: 'Rol & Persona (Şapka)',
      en: 'Role & Persona (Context)',
    },
    tagline: {
      tr: 'İş, yan projeler ve yaşam modlarını izole etme',
      en: 'Isolate work, indie projects, and personal life',
    },
    badge: {
      tr: 'İş • Indie • Yaşam • Hobiler',
      en: 'Work • Indie • Life • Hobbies',
    },
    bestFor: {
      tr: 'İş-yaşam dengesini korumak ve kimlikleri ayırmak isteyenler',
      en: 'Users balancing multiple roles, clients, and hobbies',
    },
    structure: ['👨‍💻 Work & Dev', '🚀 Indie Projects', '🏠 Life & Home', '🎨 Hobbies'],
    treePreview: {
      tr: [
        '👨‍💻 İş & Kariyer / Ekip, Cloud, Doküman',
        '🚀 Yan Projeler / Pazarlama, Ödeme, UI',
        '🏠 Ev & Yaşam / Alışveriş, Seyahat',
      ],
      en: [
        '👨‍💻 Work & Engineering / Team, Cloud, Specs',
        '🚀 Indie Projects / Launch, Billing, Growth',
        '🏠 Life & Home / Finance, Travel, Health',
      ],
    },
    prompt: {
      tr: 'Yer imlerimi yaşam rolleri ve şapkalarıma göre ayır: 👨‍💻 İş & Kariyer, 🚀 Yan Projeler (Indie), 🏠 Ev & Finans, 🎨 Kişisel Hobiler. Maksimum 2 derinlik seviyesini aşma.',
      en: 'Group bookmarks by life roles & contexts: 👨‍💻 Work & Engineering, 🚀 Side Projects, 🏠 Life & Finance, 🎨 Personal & Hobbies. Maintain a shallow hierarchy.',
    },
  },
  {
    id: 'shallow_dewey',
    icon: '🏛️',
    shortName: {
      tr: 'Sığ Taksonomi',
      en: 'Shallow Taxonomy',
    },
    name: {
      tr: '2 Seviyeli Sığ Taksonomi',
      en: 'Shallow Taxonomy (Dewey)',
    },
    tagline: {
      tr: '5-8 geniş kategori ve maksimum 1 alt klasör',
      en: '5-8 broad categories and max 1 subfolder level',
    },
    badge: {
      tr: 'Sığ Ağaç • Sıfır Mezarlık',
      en: 'Shallow Tree • Zero Graveyard',
    },
    bestFor: {
      tr: 'Kütüphaneyi temiz, dengeli ve derinlik karmaşasından uzak tutmak isteyenler',
      en: 'Anyone wanting clean, discoverable topic reference hubs',
    },
    structure: ['💻 Development', '🎨 Design', '📈 Finance', '📚 Reading', '🛠️ Utilities'],
    treePreview: {
      tr: [
        '💻 Development / Web, AI, CLI',
        '🎨 Design / Sistemler, Tipografi',
        '📈 Finance / Piyasalar, Araçlar',
      ],
      en: [
        '💻 Development / Web, AI, CLI',
        '🎨 Design / Systems, Typography',
        '📈 Finance / Markets, Calculators',
      ],
    },
    prompt: {
      tr: 'Bilişsel sınır kuralına uyarak kütüphanemi 5-8 geniş ana kategoriye ve en fazla 1 alt klasör derinliğine sahip sığ bir taksonomiyle düzenle. Derin klasör mezarlıkları yaratma.',
      en: 'Reorganize library adhering to the 2-level shallow tree rule: 5-8 broad master categories and at most 1 level of subfolders. Avoid deep folder graveyards.',
    },
  },
];
