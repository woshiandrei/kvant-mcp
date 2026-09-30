import { useMemo, useState } from "react"
import { CheckIcon, CopyIcon, KeyRoundIcon, ListTodoIcon, FolderKanbanIcon, UsersIcon, ChartColumnIcon, WorkflowIcon, InfoIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toaster } from "@/components/ui/sonner"

const SERVER_NAME = "Kvant"
const KVANT_LOGO =
  "https://static.tildacdn.com/tild3866-3831-4362-b433-633339643533/logo_kvant.svg"

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  )
}

function ChatGptIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  )
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success("Скопировано")
    return true
  } catch {
    try {
      const field = document.createElement("textarea")
      field.value = value
      field.setAttribute("readonly", "")
      field.style.position = "fixed"
      field.style.left = "-9999px"
      document.body.appendChild(field)
      field.select()
      const ok = document.execCommand("copy")
      field.remove()
      toast[ok ? "success" : "error"](ok ? "Скопировано" : "Не удалось скопировать")
      return ok
    } catch {
      toast.error("Не удалось скопировать")
      return false
    }
  }
}

const CAPABILITIES = [
  {
    icon: ListTodoIcon,
    title: "Задачи",
    text: "Смотреть список, создавать новые, менять сроки, писать комментарии.",
  },
  {
    icon: FolderKanbanIcon,
    title: "Проекты",
    text: "Открывать проекты, создавать по шаблону, добавлять в них задачи.",
  },
  {
    icon: UsersIcon,
    title: "Сотрудники",
    text: "Кто работает в компании и за что отвечает.",
  },
  {
    icon: ChartColumnIcon,
    title: "Отчёты",
    text: "Сводки по задачам — например, по проекту или типу.",
  },
  {
    icon: WorkflowIcon,
    title: "Бизнес-процессы",
    text: "Запускать готовые сценарии работы в Кванте.",
  },
] as const

function ConnectUrlField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <InputGroup className="h-10 bg-background">
      <InputGroupInput
        readOnly
        value={url}
        aria-label="Адрес для подключения"
        className="font-mono text-xs sm:text-sm"
        onFocus={(e) => e.currentTarget.select()}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => {
            const ok = await copyText(url)
            if (ok) {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1600)
            }
          }}
        >
          {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
          {copied ? "Готово" : "Скопировать"}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

export default function App() {
  const connectUrl = useMemo(() => `${window.location.origin}/api/mcp`, [])

  const claudeHref = useMemo(
    () =>
      "https://claude.ai/customize/connectors?modal=add-custom-connector" +
      `&connectorName=${encodeURIComponent(SERVER_NAME)}` +
      `&connectorUrl=${encodeURIComponent(connectUrl)}`,
    [connectUrl]
  )

  const cursorHref = useMemo(() => {
    const config = btoa(JSON.stringify({ url: connectUrl }))
    return (
      `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(SERVER_NAME)}` +
      `&config=${encodeURIComponent(config)}`
    )
  }, [connectUrl])

  return (
    <div className="page-bg min-h-svh">
      <Toaster position="bottom-center" />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-5 py-12 sm:gap-16 sm:px-8 sm:py-16">
        <header className="flex flex-col items-start gap-6">
          <img src={KVANT_LOGO} alt="Квант" className="h-7 w-auto" />
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Квант в Claude, ChatGPT и Cursor
            </h1>
          </div>
        </header>

        <section className="flex flex-col gap-4" aria-labelledby="connect-heading">
          <div className="flex flex-col gap-1">
            <h2 id="connect-heading" className="text-xl font-semibold tracking-tight">
              Как подключить
            </h2>
          </div>

          <Tabs defaultValue="claude">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
              <TabsTrigger value="claude" className="gap-1.5 px-3 py-1.5">
                <ClaudeIcon />
                Claude
              </TabsTrigger>
              <TabsTrigger value="cursor" className="gap-1.5 px-3 py-1.5">
                <img src="/cursor-mark.png" alt="" width={16} height={16} className="size-4" />
                Cursor
              </TabsTrigger>
              <TabsTrigger value="chatgpt" className="gap-1.5 px-3 py-1.5">
                <ChatGptIcon />
                ChatGPT
              </TabsTrigger>
            </TabsList>

            <TabsContent value="claude" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Подключить Claude</CardTitle>
                  <CardDescription>
                    Нажмите кнопку — откроется Claude, всё уже заполнено. Останется
                    подтвердить и войти в Квант.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <a href={claudeHref} target="_blank" rel="noopener noreferrer">
                      <ClaudeIcon data-icon="inline-start" />
                      Добавить в Claude
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cursor" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Подключить Cursor</CardTitle>
                  <CardDescription>
                    Нажмите кнопку — откроется Cursor и предложит добавить Квант.
                    Если браузер спросит разрешение — разрешите.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    asChild
                    size="lg"
                    className="w-full bg-foreground text-background hover:bg-foreground/90 sm:w-auto"
                  >
                    <a href={cursorHref}>
                      <img
                        src="/cursor-mark.png"
                        alt=""
                        width={16}
                        height={16}
                        data-icon="inline-start"
                        className="size-4"
                      />
                      Добавить в Cursor
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="chatgpt" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Подключить ChatGPT</CardTitle>
                  <CardDescription>
                    Здесь нет одной кнопки — добавьте Квант через плагины.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <ol className="flex flex-col gap-4">
                    <li className="flex gap-3">
                      <Badge variant="secondary" className="mt-0.5 size-6 shrink-0 justify-center rounded-full p-0">
                        1
                      </Badge>
                      <div className="flex flex-col gap-1">
                        <p className="font-medium">Откройте «Плагины»</p>
                        <p className="text-sm text-muted-foreground">
                          В ChatGPT зайдите в раздел «Плагины».
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <Badge variant="secondary" className="mt-0.5 size-6 shrink-0 justify-center rounded-full p-0">
                        2
                      </Badge>
                      <div className="flex flex-col gap-1">
                        <p className="font-medium">Нажмите «+»</p>
                        <p className="text-sm text-muted-foreground">
                          Кнопка «+» рядом с плагинами — добавить новый.
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <Badge variant="secondary" className="mt-0.5 size-6 shrink-0 justify-center rounded-full p-0">
                        3
                      </Badge>
                      <div className="flex w-full min-w-0 flex-col gap-2">
                        <p className="font-medium">Вставьте адрес ниже</p>
                        <ConnectUrlField url={connectUrl} />
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <Badge variant="secondary" className="mt-0.5 size-6 shrink-0 justify-center rounded-full p-0">
                        4
                      </Badge>
                      <div className="flex flex-col gap-1">
                        <p className="font-medium">Войдите в Квант</p>
                        <p className="text-sm text-muted-foreground">
                          Откроется окно входа — понадобятся ключ и домен компании
                          (как получить — в следующем блоке).
                        </p>
                      </div>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex flex-col gap-2 pt-2">
            <p className="text-sm font-medium text-muted-foreground">
              Адрес для подключения
            </p>
            <ConnectUrlField url={connectUrl} />
          </div>
        </section>

        <Separator />

        <section className="flex flex-col gap-4" aria-labelledby="auth-heading">
          <div className="flex flex-col gap-1">
            <h2 id="auth-heading" className="text-xl font-semibold tracking-tight">
              Вход в Квант
            </h2>
            <p className="text-sm text-muted-foreground">
              После подключения ассистент попросит данные вашей компании.
            </p>
          </div>

          <Alert>
            <KeyRoundIcon />
            <AlertTitle>Что понадобится</AlertTitle>
            <AlertDescription>
              <ol className="mt-2 flex list-decimal flex-col gap-2 pl-4">
                <li>
                  В Кванте наведите на свой профиль и кликните по нему
                </li>
                <li>
                  Откройте вкладку <strong>«Настройки»</strong>
                </li>
                <li>
                  Пролистайте вниз до блока <strong>«Ключи API»</strong> и
                  нажмите <strong>«Добавить»</strong>, введите название ключа —
                  после этого его можно скопировать
                </li>
                <li>
                  Домен — часть адреса до{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    .kvant.app
                  </code>
                  . Например, из{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    mycompany.kvant.app
                  </code>{" "}
                  берите{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    mycompany
                  </code>
                </li>
                <li>
                  В окне входа укажите название компании, этот домен и ключ
                </li>
              </ol>
            </AlertDescription>
          </Alert>
        </section>

        <Separator />

        <section className="flex flex-col gap-4" aria-labelledby="caps-heading">
          <div className="flex flex-col gap-1">
            <h2 id="caps-heading" className="text-xl font-semibold tracking-tight">
              Что можно попросить
            </h2>
            <p className="text-sm text-muted-foreground">
              После подключения пишите ассистенту, как коллеге. Например: «покажи
              мои задачи на сегодня».
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {CAPABILITIES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-xl border bg-card/60 px-4 py-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <Alert>
            <InfoIcon />
            <AlertTitle>Подсказка</AlertTitle>
            <AlertDescription>
              Не нужно учить команды. Спросите просто: «создай задачу Ивану на
              пятницу» или «какие у нас проекты».
            </AlertDescription>
          </Alert>
        </section>

        <footer className="pb-4 text-sm text-muted-foreground">
          Квант ·{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href="https://kvant.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            kvant.app
          </a>
        </footer>
      </main>
    </div>
  )
}
