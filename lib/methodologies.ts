export interface MethodologyPreset {
  id: string;
  icon: string;
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
  prompt: {
    tr: string;
    en: string;
  };
}

export const METHODOLOGY_PRESETS: MethodologyPreset[] = [
  {
    id: 'para',
    icon: '🎯',
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
    prompt: {
      tr: 'Yer imlerimi PARA metoduna göre düzenle: 1_Projects (aktif zaman kısıtlı projeler), 2_Areas (sürekli sorumluluklar), 3_Resources (konu/doküman kütüphanesi) ve 4_Archives (tamamlananlar). Yer İmleri Çubuğundaki günlük favicon pinlerini koru.',
      en: 'Reorganize my library strictly using the PARA method: 1_Projects (active finite projects), 2_Areas (ongoing responsibilities), 3_Resources (topics & docs), and 4_Archives (completed/inactive). Preserve daily launchpins on Bookmarks Bar.',
    },
  },
  {
    id: 'frequency',
    icon: '🔥',
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
    structure: [
      '🔥 Daily (Bar Pins)',
      '⚡ Weekly Tools',
      '📅 Monthly Reference',
      '🧊 Cold Storage',
    ],
    prompt: {
      tr: 'Yer imlerimi kullanım frekansına göre katmanlara ayır: Yer İmleri Çubuğunda günlük araçları sadece favicon olarak koru, ⚡ Weekly (sık kullanılan web araçları), 📅 Monthly (paneller, fatura, referans) ve 🧊 Cold Storage (nadir bakılan arşivler) olarak sınıflandır.',
      en: 'Organize bookmarks by access velocity: Keep daily tools as icon-only launchpins on the left of Bookmarks Bar, ⚡ Weekly (frequent tools), 📅 Monthly (infrequent/admin/billing), and 🧊 Cold Storage (rare references).',
    },
  },
  {
    id: 'johnny',
    icon: '🔟',
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
    prompt: {
      tr: 'Johnny.Decimal sistemine göre düzenle: 5-8 ana alan (10-19 Geliştirme, 20-29 Tasarım, 30-39 Yaşam & Finans vb.). Asla 2 seviyeden fazla derinlik oluşturma, düzenli ve sayısal bir taksonomi kur.',
      en: 'Organize using the Johnny.Decimal system: 5-8 primary areas numbered 10-19, 20-29, 30-39 etc., with a strict 2-level depth limit for clean engineering structure.',
    },
  },
  {
    id: 'verb',
    icon: '⚡',
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
    structure: ['🛠️ Üret (Build)', '📖 Oku (Read)', '🎓 Öğren (Learn)', '🛒 Satın Al (Buy)'],
    prompt: {
      tr: 'Klasörlerimi fiil odaklı (verb-based) eylemlere göre düzenle: 🛠️ Üret (araçlar, kod, sandbox), 📖 Oku (makaleler, dokümantasyon), 🎓 Öğren (kurslar, rehberler), 🛒 Satın Al (istek listesi, ürünler).',
      en: 'Organize into verb-based action containers: 🛠️ Build (dev tools & utilities), 📖 Read (articles & docs), 🎓 Learn (courses & guides), 🛒 Buy (wishlist & products).',
    },
  },
  {
    id: 'persona',
    icon: '💼',
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
    structure: ['👨‍💻 Work & Dev', '🚀 Indie Projects', '🏠 Life & Home', '🎨 Hobbies & Health'],
    prompt: {
      tr: 'Yer imlerimi yaşam rolleri ve şapkalarıma göre ayır: 👨‍💻 İş & Kariyer, 🚀 Yan Projeler (Indie), 🏠 Ev & Finans, 🎨 Kişisel Hobiler. Maksimum 2 derinlik seviyesini aşma.',
      en: 'Group bookmarks by life roles & contexts: 👨‍💻 Work & Engineering, 🚀 Side Projects, 🏠 Life & Finance, 🎨 Personal & Hobbies. Maintain a shallow hierarchy.',
    },
  },
  {
    id: 'shallow_dewey',
    icon: '🏛️',
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
    structure: ['💻 Development', '🎨 Design', '📈 Crypto/Finance', '📚 Reading', '🛠️ Utilities'],
    prompt: {
      tr: 'Bilişsel sınır kuralına uyarak kütüphanemi 5-8 geniş ana kategoriye ve en fazla 1 alt klasör derinliğine sahip sığ bir taksonomiyle düzenle. Derin klasör mezarlıkları yaratma.',
      en: 'Reorganize library adhering to the 2-level shallow tree rule: 5-8 broad master categories and at most 1 level of subfolders. Avoid deep folder graveyards.',
    },
  },
];
