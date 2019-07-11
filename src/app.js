const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const util = require('util')
const mkdir = util.promisify(fs.mkdir)
const access = util.promisify(fs.access)
const cookie = require('../config').cookie
const api = require('./api.js')
const ProgressBar = require('progress')
let browser
let page

async function initBrowser() {
  try {
    browser = await puppeteer.launch({
      ignoreHTTPSErrors: true,
      headless: true, // 是否启用无头模式页面
      timeout: 0
    })
    page = await browser.newPage()
    // 设置头加上跳转
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36'
    )
    await page.setExtraHTTPHeaders({
      Origin: 'https://account.geekbang.org'
    })
    await page.setCookie(...cookie)
  } catch (error) {
    console.error('初始化浏览器失败', error)
  }
}

async function downArticke({ article, pagePrint }) {
  if (!browser) {
    await initBrowser()
  }
  const curr = article.subList.find(item => item.title.indexOf(article.course.trim()) !== -1)
  let task = await api.getArticle(curr.extra.column_id)
  console.log(`找到${task.length}节课程`)
  await pageToFile(task, article.course, pagePrint.path, pagePrint.fileType)
}
/**
 * 把文件进行打印
 *
 * @param {Array} articleList 文章列表
 * @param {String} course 打印的课程名称 （文件夹名称
 * @param {String} basePath 路径前缀
 * @param {String}} fileType 打印的类型 pdf png
 */
async function pageToFile(articleList, course, basePath, fileType) {
  try {
    // 路径处理
    if (basePath) {
      basePath = path.join(path.resolve(path.normalize(basePath)), course)
    } else {
      basePath = path.join(process.cwd(), course)
    }
    const err = fs.existsSync(basePath)
    if (!err) {
      await mkdir(basePath)
    }
    // 进度条
    const progressBar = new ProgressBar('  printing: :current/:total [:bar]  :title', {
      complete: '=',
      width: 20,
      total: articleList.length
    })
    // 这里也可以使用 Promise.all，但 cpu 和网络可能都吃紧，谨慎操作
    for (let i = 0, len = articleList.length; i < len; i++) {
      let articlePage = await browser.newPage()
      let a = articleList[i]
      const fileName = filterName(`${i}-${a.article_title}`)
      const fileFullName = `${fileName}.${fileType}`
      const fileFullPath = path.join(basePath, fileFullName)
      progressBar.tick({ title: a.article_title })
      // 检查当前目录中是否存在该文件。
      try {
        await access(fileFullPath, fs.constants.F_OK)
        console.log(`${fileFullName} 已经存在， 进行下一个`)
        continue
      } catch (e) {
        console.log('开始下载')
      }
      await setPageInfo(articlePage, a.href)
      await new Promise(res => setTimeout(res, 2000))
      // 打印
      await printPage(articlePage, fileFullPath, fileType)
      articlePage.close()
    }
    console.log(`《${course}》:任务完成`)
    return true
  } catch (error) {
    console.error('打印出错', error)
  }
}

async function setPageInfo(pageInstance, href) {
  await pageInstance.setExtraHTTPHeaders({
    Origin: 'https://time.geekbang.org',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.119 Safari/537.36'
  })
  await pageInstance.goto(href, {
    referer: 'https://time.geekbang.org/',
    waitUntil: 'networkidle0'
  })

  await setCss(pageInstance)
}

async function printPage(pageInstance, fileFullPath, fileType) {
  if (fileType == 'pdf') {
    await pageInstance.pdf({
      path: fileFullPath,
      height: 1080 + 'px',
      width: 920 + 'px'
    })
  } else if (fileType == 'png') {
    await pageInstance.screenshot({
      path: fileFullPath,
      type: 'png',
      fullPage: true
    })
  }
}
/**
 *注入css，美化打印后的效果
 *
 * @param {*} pageInstance
 */
async function setCss(pageInstance) {
  await pageInstance.evaluate(async () => {
    const st = document.createElement('style')
    document.body.append(st)
    st.innerHTML = `._1ysv2txS_0, ._1Q_izgym_0, .ibY_sXau_0 {
            position: initial;
      } ._3-b6SqNP_0, ._1QFlQFbV_0, .rBDXhMZ0_0, .aWoEm1VW_0, ._352wsGxH_0, .Wz6esVdU_0, ._1Bg5E78Y_0 { display: none !important;} `
  })
}

function colse() {
  page.close()
  browser.close()
  process.exit()
}
/**
 *格式化文件名，防止特殊字符导致错误
 *
 * @param {string} name
 * @returns
 */
function filterName(name) {
  const reg = /[`~!@#$%^&*()_+<>?:"{},./;'[\]]/im
  return name.replace(reg, '')
}
exports.downArticke = downArticke
exports.colse = colse
