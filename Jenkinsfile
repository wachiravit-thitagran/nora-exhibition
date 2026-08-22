pipeline {
    agent none

    environment {
        REGISTRY_NORAEXHIBITION_IMAGE = "${REGISTRY_URL}/diis-itoc/nora-exhibition"
        REGISTRY_USER = "ci-bot"
        // ไม่ตรึงเลขไว้ — ทุกบิลด์ได้แท็กของตัวเอง จะย้อนกลับเวอร์ชันก่อนหน้าได้
        VERSION = "1.0.${BUILD_NUMBER}"
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    stages {
        stage('Checkout') {
            agent { label 'ainora-agent' }
            when {
                anyOf {
                    branch 'develop'
                    branch 'main'
                }
            }
            steps {
                checkout scm
                // stash ไว้ให้ stage ที่รันบน agent อื่น ไม่ต้อง checkout ซ้ำ
                // และได้ commit เดียวกันแน่นอนแม้ระหว่างบิลด์จะมีคนพุชเข้ามา
                stash name: 'src', useDefaultExcludes: false,
                      includes: 'index.html, frame-picker.html, Dockerfile, .dockerignore, brand/**, deploy/**, tests/**, docker-compose*.yml, assets/**'
                script {
                    env.GIT_SHA = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                }
            }
        }

        stage('Lint Dockerfile') {
            agent {
                docker {
                    image 'hadolint/hadolint:latest-debian'
                    label 'ainora-agent'
                }
            }
            when {
                branch 'develop'
            }
            steps {
                unstash 'src'
                // เขียนรายงานก่อน แล้วค่อยตัดสินผลจาก exit code
                // ถ้าให้ hadolint ล้มทันที บล็อก post จะไม่มีไฟล์รายงานให้เก็บ
                script {
                    def st = sh(script: 'hadolint --failure-threshold error Dockerfile | tee hadolint_report.txt',
                                returnStatus: true)
                    if (st != 0) { error "Dockerfile lint ไม่ผ่าน (exit ${st}) — ดู hadolint_report.txt" }
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'hadolint_report.txt', allowEmptyArchive: true
                }
            }
        }

        stage('Build & Verify') {
            when {
                anyOf {
                    branch 'develop'
                    branch 'main'
                }
            }
            parallel {
                stage('Build docker image') {
                    agent { label 'ainora-agent' }
                    steps {
                        unstash 'src'
                        // เติมวิดีโอ 22 คลิป + ภาพพื้นหลังลง assets/ ก่อน
                        // ถ้าดึงไม่สำเร็จ สคริปต์จบด้วย exit 1 ให้บิลด์ล้มตรงนี้
                        // ดีกว่าได้อิมเมจที่วิดีโอหายไปเงียบ ๆ แล้วไปรู้ตอนขึ้นจอ
                        sh 'sh deploy/fetch-media.sh'
                        sh 'du -sh assets/* | sort -h'
                        sh """
                            docker build \
                                -t "${REGISTRY_NORAEXHIBITION_IMAGE}:${VERSION}" \
                                -t "${REGISTRY_NORAEXHIBITION_IMAGE}:${GIT_SHA}" \
                                -t "${REGISTRY_NORAEXHIBITION_IMAGE}:latest" .
                        """
                        sh """docker image inspect "${REGISTRY_NORAEXHIBITION_IMAGE}:${VERSION}" \
                                 --format 'ขนาดอิมเมจ {{.Size}} ไบต์'"""
                    }
                }

                stage('Verify deck') {
                    agent {
                        docker {
                            image 'mcr.microsoft.com/playwright:v1.59.1-jammy'
                            label 'ainora-agent'
                            args '-u root'
                        }
                    }
                    steps {
                        unstash 'src'
                        // ตรวจว่าสไลด์ยังขึ้นครบและไม่มี error ทั้ง 4 โหมดการแสดงผล
                        // เบราว์เซอร์มีอยู่ในอิมเมจแล้ว จึงข้ามการดาวน์โหลด
                        sh '''
                            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
                            npm install --no-save --no-audit --no-fund playwright@1.59.1
                            EXPECT_SLIDES=${EXPECT_SLIDES:-84} node tests/check-deck.mjs "$PWD" | tee deck_report.txt
                        '''
                    }
                    post {
                        always {
                            archiveArtifacts artifacts: 'deck_report.txt', allowEmptyArchive: true
                            cleanWs()
                        }
                    }
                }
            }
        }

        stage('Upload docker image to registry') {
            agent { label 'ainora-agent' }
            // เฉพาะ main — ถ้าให้ develop push ด้วย แท็ก latest จะถูกทับ
            // แล้ว production ที่ดึง latest จะได้ของจาก develop ไปโดยไม่ตั้งใจ
            when {
                branch 'main'
            }
            steps {
                withCredentials([string(credentialsId: 'CI_REGISTRY_TOKEN', variable: 'REGISTRY_TOKEN')]) {
                    sh 'echo "$REGISTRY_TOKEN" | docker login -u "$REGISTRY_USER" --password-stdin "$REGISTRY_URL"'
                    sh """
                        docker push "${REGISTRY_NORAEXHIBITION_IMAGE}:${VERSION}"
                        docker push "${REGISTRY_NORAEXHIBITION_IMAGE}:${GIT_SHA}"
                        docker push "${REGISTRY_NORAEXHIBITION_IMAGE}:latest"
                    """
                }
            }
            post {
                always {
                    sh 'docker logout "$REGISTRY_URL" || true'
                }
            }
        }

        stage('Deploy to Production') {
            agent { label 'ainora-agent' }
            when {
                branch 'main'
            }
            steps {
                // ต้อง unstash ก่อน ไม่งั้นไม่มี docker-compose.yml ใน workspace
                unstash 'src'
                withCredentials([string(credentialsId: 'CI_REGISTRY_TOKEN', variable: 'REGISTRY_TOKEN')]) {
                    sh 'echo "$REGISTRY_TOKEN" | docker login -u "$REGISTRY_USER" --password-stdin "$REGISTRY_URL"'
                    sh """
                        ENVIRONMENT=production \
                        REGISTRY_NORAEXHIBITION_IMAGE=${REGISTRY_NORAEXHIBITION_IMAGE} \
                        docker compose -f docker-compose.yml pull
                    """
                    sh """
                        ENVIRONMENT=production \
                        REGISTRY_NORAEXHIBITION_IMAGE=${REGISTRY_NORAEXHIBITION_IMAGE} \
                        docker compose -f docker-compose.yml up -d --remove-orphans
                    """
                    sh 'docker image prune -f'
                }
                // จอนิทรรศการเปิดค้างทั้งวัน ตรวจให้แน่ว่าหน้ายังเสิร์ฟได้จริงก่อนจบบิลด์
                sh '''
                    for i in $(seq 1 20); do
                        if curl -fsS "http://127.0.0.1:${EXHIBITION_PORT:-10096}/exhibition/" -o /dev/null; then
                            echo "สไลด์ตอบสนองแล้ว"; exit 0
                        fi
                        sleep 3
                    done
                    echo "เปิดหน้าสไลด์ไม่ได้หลังรอ 60 วินาที"; exit 1
                '''
            }
            post {
                always {
                    sh 'docker logout "$REGISTRY_URL" || true'
                }
                success {
                    echo "ขึ้น production แล้ว — ${REGISTRY_NORAEXHIBITION_IMAGE}:${VERSION} (${GIT_SHA})"
                }
                failure {
                    sh 'docker logs --tail 200 nora-exhibition-web || true'
                }
            }
        }
    }
}
