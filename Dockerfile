# استخدام صورة Node.js الرسمية خفيفة الوزن
FROM node:18-slim

# ============================================
# تثبيت الأدوات الأساسية (Java 17، wget، unzip)
# ============================================
RUN apt-get update && apt-get install -y \
    openjdk-17-jdk-headless \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# ============================================
# تثبيت apktool (الإصدار 2.9.3 المستقر)
# ============================================
RUN wget https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/linux/apktool -O /usr/local/bin/apktool \
    && wget https://bitbucket.org/iBotPeaches/apktool/downloads/apktool_2.9.3.jar -O /usr/local/bin/apktool.jar \
    && chmod +x /usr/local/bin/apktool

# ============================================
# 【التعديل المهم】تحديد ذاكرة Java للحد من الاستهلاك
# هذا يحل مشكلة "Killed" بسبب OOM (نفاد الذاكرة)
# ============================================
ENV JAVA_OPTS="-Xmx512m"

# ============================================
# تثبيت Android SDK (لـ zipalign و jarsigner)
# ============================================
RUN apt-get update && apt-get install -y android-sdk \
    && rm -rf /var/lib/apt/lists/*

# ============================================
# تحديد مجلد العمل ونسخ ملفات المشروع
# ============================================
WORKDIR /app
COPY . .

# ============================================
# الانتقال إلى مجلد server وتثبيت الاعتماديات
# ============================================
WORKDIR /app/server
RUN npm install

# ============================================
# فتح المنفذ الذي يستمع عليه الخادم
# ============================================
EXPOSE 3000

# ============================================
# تشغيل الخادم
# ============================================
CMD ["node", "server.js"]
