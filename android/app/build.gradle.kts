plugins {
    id("com.android.application")
}

// Адрес твоего приложения на Cloudflare. Меняется только здесь.
val siteHost = "slovo-dano.farbosbro.workers.dev"

android {
    namespace = "app.slovodano"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.slovodano"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        // Подставляется в AndroidManifest.xml (ссылки на сайт открываются в приложении)
        manifestPlaceholders["siteHost"] = siteHost
        // Адрес, который открывает приложение, и заявление «приложение связано с сайтом»
        resValue("string", "site_url", "https://$siteHost")
        resValue(
            "string", "asset_statements",
            """[{ \"relation\": [\"delegate_permission/common.handle_all_urls\"], \"target\": { \"namespace\": \"web\", \"site\": \"https://$siteHost\" } }]"""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

dependencies {
    // Trusted Web Activity. Если Gradle не найдёт эту версию, поставь 2.2.0 (указана в документации Chrome).
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.6.2")
}
