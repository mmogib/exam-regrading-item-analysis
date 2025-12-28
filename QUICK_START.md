# Quick Start Guide

## 🚀 Getting Started in 3 Steps

### Step 1: Install Dependencies
```bash
cd exam-grading-app
npm install
```

This will install all required packages (React, Next.js, TypeScript, Tailwind CSS, shadcn/ui, SheetJS, etc.)

### Step 2: Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 3: Build for Production
```bash
npm run build
```

The static site will be generated in the `out/` directory.

## 📁 Project Overview

This is a **complete, ready-to-deploy** Next.js application that converts your R Shiny exam grading app to a modern TypeScript/React web app.

### Key Features:
- ✅ **Client-side only**: All Excel processing happens in the browser (no backend needed)
- ✅ **Modern UI**: Built with shadcn/ui components and Tailwind CSS
- ✅ **Type-safe**: Full TypeScript support
- ✅ **Static export**: Ready for Netlify deployment
- ✅ **Responsive**: Works on all devices
- ✅ **Alphanumeric codes**: Supports V1, A, 002, etc.
- ✅ **File re-upload**: Modify and re-upload files seamlessly
- ✅ **Position mapping**: See question positions across versions
- ✅ **Configurable filenames**: Customize via JSON config

## 🎨 What's Included

```
exam-grading-app/
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout with fonts
│   ├── page.tsx           # Main page with tabs
│   └── globals.css        # Global styles with academic theme
│
├── components/            # React components
│   ├── ui/               # shadcn/ui components (Button, Card, Table, etc.)
│   ├── re-grading.tsx    # Re-grading module (complete)
│   └── uncoding.tsx      # Cross-version analysis module (complete)
│
├── config/               # Configuration
│   ├── downloads.json    # Download filename configuration
│   └── downloads.ts      # Type-safe config loader
│
├── lib/                   # Utility functions
│   ├── utils.ts          # cn() function for class merging
│   └── excel-utils.ts    # All Excel processing logic (SheetJS)
│
├── types/
│   └── exam.ts           # TypeScript type definitions
│
├── Configuration files
│   ├── package.json      # Dependencies and scripts
│   ├── next.config.js    # Next.js config (static export)
│   ├── tailwind.config.ts # Tailwind CSS config (academic theme)
│   ├── tsconfig.json     # TypeScript config
│   └── netlify.toml      # Netlify deployment config
│
└── Documentation
    ├── README.md         # Full documentation
    ├── DEPLOYMENT.md     # Netlify deployment guide
    └── QUICK_START.md    # This file
```

## 🎯 How to Use the App

### Re-grading Tab
1. Upload `import_test_data.xls` file
2. Set number of questions
3. Configure correct answers (multiple answers supported!)
4. Click "Re-grade Exam"
5. Download revised files

### Cross-Version Analysis Tab
1. Upload answers file and `item_analysis.csv`
2. Set number of questions
3. Click "Compute Averages"
4. Download statistics files:
   - `master-question-statistics.xlsx` - Per master question stats
   - `exam-version-statistics.xlsx` - Per version stats

## 🚢 Deploying to Netlify

### Easiest Method (Drag & Drop):
1. Run `npm run build`
2. Go to [netlify.com/drop](https://app.netlify.com/drop)
3. Drag the `out/` folder
4. Done! Your site is live.

### GitHub Method (Recommended for updates):
1. Push code to GitHub
2. Connect repository to Netlify
3. Netlify auto-deploys on every push

See `DEPLOYMENT.md` for detailed instructions.

## 🎨 Design Features

The app features a distinctive **academic/professional aesthetic**:
- Clean serif fonts (Crimson Pro) for headers
- Modern sans-serif (Geist) for body text
- Subtle grid background pattern
- Professional color palette (navy blue, warm grays, burgundy accents)
- Smooth animations and transitions
- Responsive design for all screen sizes

## 🔧 Customization

### Change Colors
Edit `app/globals.css` to modify the color scheme.

### Modify Logic
Edit `lib/excel-utils.ts` for Excel processing logic.

### Add Components
Use shadcn/ui CLI to add more components:
```bash
npx shadcn-ui@latest add [component-name]
```

## 📝 Notes

- All processing is **client-side** (privacy-first, no server needed)
- Excel files are processed using **SheetJS** (industry standard)
- Supports **multi-correct answers** (just like your R version)
- Built with **Next.js 14** (latest version)
- Uses **TypeScript** for type safety
- Styled with **Tailwind CSS** and **shadcn/ui**

## ❓ Troubleshooting

### Dependencies won't install
```bash
rm -rf node_modules package-lock.json
npm install
```

### Port 3000 is already in use
```bash
npm run dev -- -p 3001
```

### Build fails
Check that all dependencies are installed:
```bash
npm install
```

## 📞 Support

For questions or issues:
- Check `README.md` for full documentation
- Review `DEPLOYMENT.md` for deployment help
- Examine the code - it's well-commented!

## 🎓 Developed By

Dr. Nasir Abbas  
Department of Mathematics  
King Fahd University of Petroleum & Minerals (KFUPM)

---

**Enjoy your modern exam grading tool! 🎉**
