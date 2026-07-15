FROM node:18-slim

# تثبيت Java والأدوات المطلوبة لبناء APK
RUN apt-get update && apt-get install -y \
    openjdk-11-jdk-headless \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# تثبيت apktool
RUN wget https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/linux/apktool -O /usr/local/bin/apktool \
    && wget https://bitbucket.org/iBotPeaches/apktool/downloads/apktool_2.9.3.jar -O /usr/local/bin/apktool.jar \
    && chmod +x /usr/local/bin/apktool

# تثبيت Android SDK (لـ zipalign و jarsigner)
RUN apt-get update && apt-get install -y android-sdk && rm -rf /var/lib/apt/lists/*

# تحديد مجلد العمل ونسخ الملفات
WORKDIR /app
COPY . .

# الانتقال إلى مجلد server وتثبيت الاعتماديات
WORKDIR /app/server
RUN npm install

# فتح المنفذ
EXPOSE 3000

# تشغيل الخادم
CMD ["node", "server.js"]
