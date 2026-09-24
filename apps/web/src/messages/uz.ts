// Barcha UI matnlari shu yerda. Kelajakda i18n qo'shilsa, shu fayl asos bo'ladi.
export const uz = {
  app: { name: 'Durbin', section: 'Marketing' },
  nav: {
    dashboard: 'Dashboard',
    instagram: 'Instagram',
    ads: 'Facebook Ads',
    content: 'Kontent Plan',
    goals: 'Maqsadlar',
    ai: 'AI Yordamchi',
  },
  auth: {
    login: 'Kirish',
    register: "Ro'yxatdan o'tish",
    logout: 'Chiqish',
    email: 'Email',
    password: 'Parol',
    name: 'Ismingiz',
    schoolName: 'Maktab nomi',
    noAccount: "Akkauntingiz yo'qmi?",
    haveAccount: 'Akkauntingiz bormi?',
  },
  common: {
    save: 'Saqlash',
    cancel: 'Bekor qilish',
    delete: "O'chirish",
    loading: 'Yuklanmoqda...',
    error: 'Xatolik yuz berdi',
    comingSoon: "Bu bo'lim keyingi bosqichda qo'shiladi",
  },
  periods: {
    this_week: 'Bu hafta',
    this_month: 'Bu oy',
    last_month: "O'tgan oy",
  },
} as const;
