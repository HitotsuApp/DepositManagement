import { View, Text, StyleSheet } from "@react-pdf/renderer"

interface NoticeBlockProps {
  notice: {
    title: string
    lines: string[]
    fontSize?: number
    marginTop?: number
  }
}

const NoticeBlock = ({ notice }: NoticeBlockProps) => {
  return (
    <View style={{ marginTop: notice.marginTop ?? 20 }}>
      <Text style={[styles.title, { fontSize: notice.fontSize ?? 10 }]}>
        {notice.title}
      </Text>
      {notice.lines.map((line, i) => (
        <Text
          key={i}
          style={[styles.line, { fontSize: notice.fontSize ?? 10 }]}
        >
          {line}
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  title: {
    fontWeight: "bold",
    marginBottom: 4,
    fontFamily: "NotoSansJP",
  },
  line: {
    marginBottom: 2,
    fontFamily: "NotoSansJP",
  },
})

export default NoticeBlock
